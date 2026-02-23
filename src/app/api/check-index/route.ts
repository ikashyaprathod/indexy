import { NextRequest } from "next/server";
import pLimit from "p-limit";
import { checkGoogleIndex, checkBingIndex } from "@/lib/scraper/engine";
import { saveScan, getCachedScan, createBatch, saveBatchResult, getIpUsage, incrementIpUsage } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { validateRequest, getClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — enough for 50 URLs via Playwright fallback

// ─── Types ────────────────────────────────────────────────────────────────────
type CheckStatus = "INDEXED" | "NOT_INDEXED" | "ERROR";

interface ScanResult {
    url: string;
    status: CheckStatus;
    checked_at: string;
    engine?: string;
}

// ─── Serper API Check (Primary — Production) ──────────────────────────────────
// Serper.dev handles Google scraping on their own IP-rotating infrastructure.
// No CAPTCHAs, no rate limits on our side, handles 50 concurrent requests safely.
async function checkViaSerper(url: string): Promise<CheckStatus> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) throw new Error("No Serper API key"); // caller falls back to Playwright

    // Strip protocol for the site: query — same logic as engine.ts toSiteQuery
    let siteQuery: string;
    try {
        const u = new URL(url);
        siteQuery = (u.hostname + u.pathname).replace(/\/$/, "");
    } catch {
        siteQuery = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    }

    const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
            "X-API-KEY": apiKey,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            q: `site:${siteQuery}`,
            num: 5,
            gl: "us",
            hl: "en",
        }),
        signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 402 || res.status === 429) {
        throw new Error(`SERPER_LIMIT:${res.status}`);
    }

    if (!res.ok) {
        console.error(`[Serper] HTTP ${res.status} for ${siteQuery}`);
        return "ERROR";
    }

    const data = await res.json();
    const organic: Array<{ link: string }> = data.organic ?? [];

    if (organic.length === 0) {
        console.log(`[Serper] NOT_INDEXED: site:${siteQuery}`);
        return "NOT_INDEXED";
    }

    // Verify at least one result link belongs to the target URL's domain/path.
    // This prevents a broad site:domain.com query from falsely showing INDEXED
    // when the results are for different pages on the same domain.
    const normTarget = siteQuery.toLowerCase();
    const matched = organic.some((r) => {
        const normLink = r.link
            .replace(/^https?:\/\//, "")
            .replace(/\/$/, "")
            .toLowerCase();
        // Match if the result link starts with the target path
        return normLink.startsWith(normTarget) || normTarget.startsWith(normLink.split("/")[0]);
    });

    console.log(`[Serper] ${matched ? "INDEXED" : "NOT_INDEXED"}: site:${siteQuery}`);
    return matched ? "INDEXED" : "NOT_INDEXED";
}

// ─── Route Handler ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
    try {
        // ─── 0. Security Validation ───────────────────────────────────────────
        const { valid, error } = await validateRequest(request);
        if (!valid) {
            console.error(`[Security] Blocked: ${error}`);
            return new Response(
                JSON.stringify({ error: error || "Unauthorized access" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        const { urls, economyMode } = await request.json();

        if (!Array.isArray(urls) || urls.length === 0) {
            return new Response(
                JSON.stringify({ error: "No URLs provided" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Detect logged-in user — they get a higher URL cap and batch tracking
        const session = await getSession();
        const clientIp = getClientIp(request);

        // ─── 1. IP Rate Limiting (Server-Side) ───────────────────────────────
        if (!session) {
            const usage = getIpUsage(clientIp);
            if (usage.count >= 30) {
                return new Response(
                    JSON.stringify({ error: "Daily limit reached (30 URLs/day for guests). Create account for unlimited access." }),
                    { status: 429, headers: { "Content-Type": "application/json" } }
                );
            }
        }

        const maxUrls = session ? 500 : 30; // Enforce capped guest limit
        const urlList: string[] = urls
            .slice(0, maxUrls)
            .map((u: string) => u.trim())
            .filter(Boolean);

        const hasSerper = !!(
            process.env.SERPER_API_KEY &&
            process.env.SERPER_API_KEY !== "your_serper_api_key_here"
        );

        // Serper = 10 concurrent (their infra handles it)
        // Playwright fallback = 2 concurrent (local dev, avoid IP blocks)
        const limit = pLimit(hasSerper ? 10 : 2);

        console.log(
            `[API] ${session ? `User #${session.userId}` : "Guest"} checking ${urlList.length} URLs via ${economyMode ? "Economy Mode (Local)" : hasSerper ? "Serper API" : "Playwright fallback"
            }`
        );

        // Create a batch record for logged-in users
        const batch = session ? createBatch(session.userId, urlList.length) : null;

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                // Track how many have completed so the client can show X/total
                let completed = 0;
                const total = urlList.length;

                const send = (data: object) => {
                    try {
                        controller.enqueue(
                            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
                        );
                    } catch {
                        // Stream already closed (client disconnected)
                    }
                };

                // Send a metadata event first so the frontend knows the total
                send({ type: "meta", total });

                const tasks = urlList.map((url: string) =>
                    limit(async () => {
                        let status: CheckStatus = "ERROR";
                        let fromCache = false;
                        let engine = "Cache";

                        // ── Cache-first lookup (7 days TTL) ───────────────────
                        // If we've checked this URL in the last 168h, serve the
                        // cached result instantly — zero API calls consumed.
                        try {
                            const cached = getCachedScan(url, 168);
                            if (cached) {
                                status = cached.status;
                                fromCache = true;
                                console.log(`[Cache] HIT: ${url} → ${status}`);
                            }
                        } catch {
                            // DB read failure — proceed to live check
                        }

                        if (!fromCache) {
                            if (hasSerper && !economyMode) {
                                // ── Serper path ──────────────────────────────────
                                try {
                                    status = await checkViaSerper(url);
                                } catch (err: any) {
                                    const isLimit = err.message?.startsWith("SERPER_LIMIT");
                                    console.error(`[Serper] ${isLimit ? "Credits Exhausted" : "Error"} for ${url}`);

                                    // AUTOMATIC FAILOVER to local Playwright (Google -> Bing)
                                    try {
                                        console.log(`[Failover] Falling back to Local Scraper for ${url}`);
                                        const r = await checkGoogleIndex(url);
                                        if (r.status === "ERROR") {
                                            // Google blocked us? Try BING (Infinite Free Fallback)
                                            console.log(`[Failover] Google blocked local. Trying BING for ${url}`);
                                            const b = await checkBingIndex(url);
                                            status = b.status;
                                            engine = "Bing (Backup)";
                                        } else {
                                            status = r.status;
                                            engine = "Google (Local)";
                                        }
                                    } catch {
                                        status = "ERROR";
                                    }
                                }
                            } else {
                                // ── Playwright path (Economy or No API Key) ──
                                try {
                                    const r = await checkGoogleIndex(url);
                                    if (r.status === "ERROR") {
                                        // Google blocked us? Try BING
                                        console.log(`[Scraper] Google blocked local. Trying BING for ${url}`);
                                        const b = await checkBingIndex(url);
                                        status = b.status;
                                        engine = "Bing (Backup)";
                                    } else {
                                        status = r.status;
                                        engine = "Google (Local)";
                                    }
                                } catch {
                                    status = "ERROR";
                                }
                            }

                            // Persist fresh result to cache (skip ERROR results)
                            try {
                                if (status !== "ERROR") {
                                    saveScan(url, status);
                                    // Also save to the user's batch if logged in
                                    if (batch) {
                                        saveBatchResult(batch.id, url, status);
                                    }
                                }
                            } catch {
                                // DB write failure — non-fatal
                            }
                        }

                        const checked_at = new Date().toISOString();
                        completed++;

                        // Stream result immediately with progress info
                        const result: ScanResult & { type: string; completed: number; total: number } = {
                            type: "result",
                            url,
                            status,
                            engine,
                            checked_at,
                            completed,
                            total,
                        };
                        send(result);
                    })
                );

                await Promise.all(tasks);

                // ─── 2. Update Usage Stats ───────────────────────────────────
                if (!session) {
                    incrementIpUsage(clientIp, urlList.length);
                }

                // Signal the client the stream is fully done
                send({ type: "done", total });
                controller.close();
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
                "X-Accel-Buffering": "no",
            },
        });
    } catch {
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}
