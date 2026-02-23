"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Zap,
    Globe,
    Link2,
    Layers,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Lock,
    ExternalLink,
    Loader2,
} from "lucide-react";
import { getApiToken } from "@/app/actions/security";

interface ScanResult {
    url: string;
    status: "INDEXED" | "NOT_INDEXED" | "ERROR";
    checked_at: string;
}

const GUEST_DAILY_LIMIT = 30;
const LOCALSTORAGE_KEY = "indexy_guest_checks";

function getGuestChecksToday(): number {
    if (typeof window === "undefined") return 0;
    const data = localStorage.getItem(LOCALSTORAGE_KEY);
    if (!data) return 0;
    const parsed = JSON.parse(data);
    const today = new Date().toDateString();
    return parsed.date === today ? parsed.count : 0;
}

function incrementGuestChecks(count: number) {
    if (typeof window === "undefined") return;
    const today = new Date().toDateString();
    const current = getGuestChecksToday();
    localStorage.setItem(
        LOCALSTORAGE_KEY,
        JSON.stringify({ date: today, count: current + count })
    );
}

function truncateUrl(url: string, max = 40): string {
    try {
        const u = new URL(url);
        const full = u.hostname + u.pathname;
        return full.length > max ? full.slice(0, max) + "…" : full;
    } catch {
        return url.length > max ? url.slice(0, max) + "…" : url;
    }
}

/** Strip protocol so site: queries are correct (e.g. site:example.com/path) */
function toSiteQuery(url: string): string {
    try {
        const u = new URL(url);
        return (u.hostname + u.pathname).replace(/\/$/, "");
    } catch {
        return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    }
}

export default function CheckerCard() {
    const [user, setUser] = useState<{ id: number; name: string } | null>(null);
    const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");
    const [inputValue, setInputValue] = useState("");
    const [isChecking, setIsChecking] = useState(false);
    const [results, setResults] = useState<ScanResult[]>([]);
    const [guestChecksUsed, setGuestChecksUsed] = useState(0);
    const [limitReached, setLimitReached] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Live progress counter: how many URLs have been verified so far
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

    useEffect(() => {
        const used = getGuestChecksToday();
        setGuestChecksUsed(used);
        setLimitReached(used >= GUEST_DAILY_LIMIT);

        // Load auth status
        fetch("/api/auth/me")
            .then((r) => r.json())
            .then((data) => {
                if (data.user) setUser(data.user);
            })
            .catch(() => { });

        // Load initial history
        fetch("/api/history")
            .then((r) => r.json())
            .then((data) => {
                if (data.results) setResults(data.results.slice(0, 10));
            })
            .catch(() => { });
    }, []);

    const handleCheck = useCallback(async () => {
        if (limitReached) return;
        setError(null);

        const urls = inputValue
            .split("\n")
            .map((u) => u.trim())
            .filter(Boolean);

        if (urls.length === 0) {
            setError("Please enter at least one URL.");
            return;
        }

        const urlsToCheck = urls.slice(0, activeTab === "single" ? 1 : 50);
        const newUsed = guestChecksUsed + urlsToCheck.length;

        if (newUsed > GUEST_DAILY_LIMIT) {
            setLimitReached(true);
            setError(`You've reached today's limit of ${GUEST_DAILY_LIMIT} checks.`);
            return;
        }

        setIsChecking(true);
        setProgress(null);
        try {
            const token = await getApiToken();

            const res = await fetch("/api/check-index", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Indexy-Token": token
                },
                body: JSON.stringify({ urls: urlsToCheck }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Check failed");
            }

            // ── SSE Stream Reader ─────────────────────────────────────────────
            // Events: { type:"meta", total } | { type:"result", url, status, completed, total } | { type:"done" }
            const reader = res.body?.getReader();
            if (!reader) throw new Error("No stream body returned.");

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    try {
                        const event = JSON.parse(line.slice(6));
                        if (event.type === "meta") {
                            // Kick off the progress counter with the known total
                            setProgress({ done: 0, total: event.total });
                        } else if (event.type === "result") {
                            setResults((prev) => [event as ScanResult, ...prev].slice(0, 50));
                            setProgress({ done: event.completed, total: event.total });
                        } else if (event.type === "done") {
                            setProgress(null);
                        } else {
                            // Legacy format (no type field) — still handle it
                            setResults((prev) => [event as ScanResult, ...prev].slice(0, 50));
                        }
                    } catch {
                        // Malformed chunk — skip
                    }
                }
            }

            incrementGuestChecks(urlsToCheck.length);
            setGuestChecksUsed(newUsed);
            if (newUsed >= GUEST_DAILY_LIMIT) setLimitReached(true);
            setProgress(null);
            setInputValue("");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
        } finally {
            setIsChecking(false);
        }
    }, [inputValue, activeTab, guestChecksUsed, limitReached]);

    const remaining = Math.max(0, GUEST_DAILY_LIMIT - guestChecksUsed);

    return (
        <div
            className="card-glow rounded-2xl overflow-hidden w-full"
            style={{ maxWidth: 1300 }}
        >
            {/* Tab bar - small pill toggles inside */}
            <div className="flex justify-center pt-8 pb-4">
                <div className="flex bg-[#0D101D] rounded-lg p-1 border border-white/[0.03]">
                    <button
                        onClick={() => setActiveTab("single")}
                        className={`py-2 px-6 text-[13px] font-semibold flex items-center gap-2 rounded-md transition-all ${activeTab === "single" ? "bg-[#1A1E2E] text-white shadow-sm border border-white/[0.05]" : "text-[#64748b] hover:text-white"
                            }`}
                    >
                        <Link2 size={14} className={activeTab === "single" ? "text-white" : "text-[#64748b]"} />
                        Single URL
                    </button>
                    <button
                        onClick={() => setActiveTab("bulk")}
                        className={`py-2 px-6 text-[13px] font-semibold flex items-center gap-2 rounded-md transition-all ${activeTab === "bulk" ? "bg-[#1A1E2E] text-white shadow-sm border border-white/[0.05]" : "text-[#64748b] hover:text-white"
                            }`}
                    >
                        <Layers size={14} className={activeTab === "bulk" ? "text-white" : "text-[#64748b]"} />
                        Bulk Mode
                    </button>
                </div>
            </div>

            {/* Input area */}
            <div className="px-6 space-y-4">
                <div className="p-5 flex items-start gap-4 rounded-xl bg-[#0D101D] border border-white/[0.03]">
                    <Globe size={18} className="mt-1 shrink-0 text-[#475569]" />
                    <textarea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={
                            activeTab === "single"
                                ? "https://example.com/page-to-check"
                                : "https://example.com/page-to-check\nhttps://example.com/another-page"
                        }
                        rows={activeTab === "bulk" ? 5 : 3}
                        className="flex-1 bg-transparent resize-none outline-none text-[13px] w-full font-mono font-medium placeholder-[#334155]"
                        style={{ color: "#94a3b8", lineHeight: 1.6 }}
                    />
                </div>

                {/* Guest info bar */}
                <div className="px-4 py-4 rounded-xl bg-[#0D101D] border border-white/[0.03]">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "#475569" }}>
                        <span>
                            Guest Mode: <span className="text-[#94a3b8]">10 URLs per check</span>
                        </span>
                        <span>
                            <span className={remaining < 5 ? "text-red-400" : "text-[#94a3b8]"}>
                                20
                            </span> per day remaining
                        </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full h-1.5 bg-[#141925] rounded-full overflow-hidden">
                        <div
                            className="h-full bg-[#3b82f6] rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                            style={{ width: "65%" }}
                        />
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div
                        className="flex items-center gap-2 rounded-lg p-3 text-sm"
                        style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}
                    >
                        <AlertCircle size={14} />
                        {error}
                    </div>
                )}

                {/* CTA Button */}
                <button
                    onClick={handleCheck}
                    disabled={isChecking || limitReached}
                    className="w-full py-4.5 rounded-xl font-bold text-[15px] text-white flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:brightness-110 shadow-[0_4px_20px_rgba(124,58,237,0.3)]"
                    style={{ background: "#7c3aed" }}
                >
                    {isChecking ? (
                        <>
                            <Loader2 size={18} className="animate-spin" />
                            {progress
                                ? `Checking… (${progress.done} / ${progress.total})`
                                : "Checking…"}
                        </>
                    ) : (
                        <>
                            <Zap size={18} fill="white" />
                            Check Index Status
                        </>
                    )}
                </button>

                <p className="text-center font-bold text-[9px] tracking-[0.1em] text-[#4b5563] uppercase pt-1">
                    POWERED BY REAL-TIME GOOGLE SEARCH VERIFICATION.
                </p>

                {/* Limit reached banner (Hidden for logged in users) */}
                {!user && (
                    <div className="bg-[#121421] border border-white/[0.04] rounded-xl p-5 flex items-center justify-between mt-6 shadow-inner">
                        <div className="flex items-center gap-4">
                            <div className="w-[42px] h-[42px] rounded-xl bg-[#1A1E2E] flex items-center justify-center border border-white/[0.05]">
                                <Lock size={16} className="text-[#6366f1]" fill="currentColor" />
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <p className="text-[14px] font-bold text-[#f1f5f9]">
                                    You've reached today's limit.
                                </p>
                                <p className="text-[12px] text-[#475569] font-medium">
                                    Create Free Account &ndash; Unlimited Checks
                                </p>
                            </div>
                        </div>
                        <button className="bg-[#1e2336] hover:bg-[#282f4a] transition-colors text-[12px] font-bold text-white px-5 py-2.5 rounded-lg border border-white/[0.08] shadow-sm">
                            Create Account
                        </button>
                    </div>
                )}
            </div>

            {/* Divider line */}
            <div className="mx-6 mt-6 mb-2 border-t border-white/5" />

            {/* Results table */}
            <div className="px-6 pt-10 pb-4">
                <div className="flex items-center justify-between mb-4 px-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#334155]">
                        LAST CHECK
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#334155]">
                        STATUS
                    </span>
                </div>

                <style dangerouslySetInnerHTML={{
                    __html: `
                        .custom-scrollbar::-webkit-scrollbar {
                            width: 6px;
                        }
                        .custom-scrollbar::-webkit-scrollbar-track {
                            background: transparent;
                        }
                        .custom-scrollbar::-webkit-scrollbar-thumb {
                            background: rgba(255, 255, 255, 0.1);
                            border-radius: 10px;
                        }
                        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                            background: rgba(255, 255, 255, 0.2);
                        }
                    `}} />

                <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                    {/* Mockup Rows for parity */}
                    {!isChecking && results.length === 0 && (
                        <>
                            <div className="p-4 rounded-xl bg-[#0D101D] border border-white/[0.03] flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-[#141925] flex items-center justify-center border border-white/[0.05]">
                                        <Globe size={14} className="text-[#334155]" />
                                    </div>
                                    <span className="text-[13px] font-mono font-medium text-[#94a3b8]">https://indexy.app/features</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2 bg-[#064e3b]/20 border border-[#10b981]/20 px-3 py-1.5 rounded-lg">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] shadow-[0_0_6px_#10b981]" />
                                        <span className="text-[10px] font-bold text-[#10b981] uppercase tracking-wider">INDEXED</span>
                                    </div>
                                    <ExternalLink size={14} className="text-[#334155]" />
                                </div>
                            </div>
                            <div className="p-4 rounded-xl bg-[#0D101D] border border-white/[0.03] flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-[#141925] flex items-center justify-center border border-white/[0.05]">
                                        <Globe size={14} className="text-[#334155]" />
                                    </div>
                                    <span className="text-[13px] font-mono font-medium text-[#94a3b8]">https://indexy.app/pricing</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2 bg-[#450a0a]/20 border border-[#ef4444]/20 px-3 py-1.5 rounded-lg">
                                        <span className="text-[10px] font-bold text-[#ef4444] uppercase tracking-wider">NOT INDEXED</span>
                                    </div>
                                    <ExternalLink size={14} className="text-[#334155]" />
                                </div>
                            </div>
                        </>
                    )}

                    {results.slice(0, 50).map((result, i) => (
                        <div
                            key={i}
                            className="p-4 rounded-xl bg-[#0D101D] border border-white/[0.03] flex items-center justify-between gap-4 animate-fade-in-up"
                            style={{ animationDelay: `${i * 40}ms` }}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-[#141925] flex items-center justify-center shrink-0 border border-white/[0.05]">
                                    <Globe size={14} className="text-[#334155]" />
                                </div>
                                <span
                                    className="text-[13px] truncate font-mono font-medium text-[#94a3b8]"
                                    style={{ maxWidth: 300 }}
                                    title={result.url}
                                >
                                    {truncateUrl(result.url, 45)}
                                </span>
                            </div>
                            <div className="flex items-center gap-4 shrink-0">
                                {result.status === "INDEXED" ? (
                                    <div className="flex items-center gap-2 bg-[#064e3b]/20 border border-[#10b981]/20 px-3 py-1.5 rounded-lg">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] shadow-[0_0_6px_#10b981]" />
                                        <span className="text-[10px] font-bold text-[#10b981] uppercase tracking-wider">INDEXED</span>
                                    </div>
                                ) : result.status === "NOT_INDEXED" ? (
                                    <div className="flex items-center gap-2 bg-[#450a0a]/20 border border-[#ef4444]/20 px-3 py-1.5 rounded-lg">
                                        <span className="text-[10px] font-bold text-[#ef4444] uppercase tracking-wider">NOT INDEXED</span>
                                    </div>
                                ) : (
                                    <div className="bg-[#141925] text-[#475569] border border-white/5 text-[10px] uppercase font-bold px-3 py-1.5 rounded-lg tracking-wider">
                                        ERROR
                                    </div>
                                )}
                                <a
                                    href={`https://www.google.com/search?q=${encodeURIComponent(`site:${toSiteQuery(result.url)}`)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <ExternalLink size={14} className="text-[#334155] hover:text-white transition-colors cursor-pointer" />
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
