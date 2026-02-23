"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    Zap, Link2, TrendingUp, Clock, CheckCircle2, XCircle,
    AlertCircle, Globe, ExternalLink, RefreshCw, Trash2,
    LayoutDashboard, LogOut, ChevronRight, Loader2
} from "lucide-react";
import Link from "next/link";
import Footer from "@/components/Footer";

// ─── Types ────────────────────────────────────────────────────────────────────
interface User { id: number; name: string; email: string; plan: string; }
interface Stats {
    totalChecked: number; totalIndexed: number; avgIndexRate: number;
    lastChecked: string | null; lastBatchSize: number;
}
interface Batch {
    id: number; user_id: number; total_urls: number;
    indexed_count: number; created_at: string;
}
interface ScanResult {
    url: string; status: "INDEXED" | "NOT_INDEXED" | "ERROR";
    checked_at: string; engine?: string; type?: string; completed?: number; total?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(iso: string | null): string {
    if (!iso) return "Never";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}
function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function toSiteQuery(url: string): string {
    try { const u = new URL(url); return (u.hostname + u.pathname).replace(/\/$/, ""); }
    catch { return url.replace(/^https?:\/\//, "").replace(/\/$/, ""); }
}

export default function DashboardPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [stats, setStats] = useState<Stats | null>(null);
    const [batches, setBatches] = useState<Batch[]>([]);
    const [urlInput, setUrlInput] = useState("");
    const [results, setResults] = useState<ScanResult[]>([]);
    const [queue, setQueue] = useState<{ url: string; status: "checking" | "queued" }[]>([]);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [selectedBatch, setSelectedBatch] = useState<{ id: number; results: ScanResult[] } | null>(null);
    const [loadingBatch, setLoadingBatch] = useState<number | null>(null);
    const [economyMode, setEconomyMode] = useState(false);

    // Initial persistence load
    useEffect(() => {
        const saved = localStorage.getItem("indexy_economy_mode");
        if (saved !== null) setEconomyMode(saved === "true");
    }, []);

    // Change persistence
    const toggleEconomy = () => {
        const next = !economyMode;
        setEconomyMode(next);
        localStorage.setItem("indexy_economy_mode", String(next));
    };

    // ── Load user + initial data ───────────────────────────────────────────────
    useEffect(() => {
        fetch("/api/auth/me").then(r => r.json()).then(d => {
            if (!d.user) { router.push("/"); return; }
            setUser(d.user);
        });
        refreshStats();
        refreshBatches();
    }, [router]);

    const refreshStats = useCallback(() => {
        fetch("/api/dashboard/stats").then(r => r.json()).then(setStats).catch(() => { });
    }, []);
    const refreshBatches = useCallback(() => {
        fetch("/api/dashboard/batches").then(r => r.json()).then(d => setBatches(d.batches ?? [])).catch(() => { });
    }, []);

    const viewBatchDetails = async (batchId: number) => {
        setLoadingBatch(batchId);
        try {
            const res = await fetch(`/api/dashboard/batches/${batchId}`);
            if (!res.ok) throw new Error("Failed to fetch batch results");
            const data = await res.json();
            setSelectedBatch({ id: batchId, results: data.results });
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingBatch(null);
        }
    };

    async function handleLogout() {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
    }

    // ── Check URLs ─────────────────────────────────────────────────────────────
    async function handleCheck() {
        const urls = urlInput.split("\n").map(u => u.trim()).filter(Boolean);
        if (!urls.length) return;
        setIsChecking(true);
        setResults([]);
        setProgress(null);
        // Build initial queue
        setQueue(urls.map(url => ({ url, status: "queued" as const })));

        try {
            const res = await fetch("/api/check-index", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ urls, economyMode }),
            });
            if (!res.ok || !res.body) throw new Error("Stream failed");

            const reader = res.body.getReader();
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
                            setProgress({ done: 0, total: event.total });
                        } else if (event.type === "result") {
                            // Update queue: mark first "queued" as checked
                            setQueue(prev => {
                                const idx = prev.findIndex(q => q.url === event.url);
                                if (idx === -1) return prev;
                                const next = [...prev];
                                next.splice(idx, 1);
                                return next;
                            });
                            setResults(prev => [event, ...prev]);
                            setProgress({ done: event.completed, total: event.total });
                        } else if (event.type === "done") {
                            setProgress(null);
                            setQueue([]);
                        }
                    } catch { /* skip malformed */ }
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsChecking(false);
            setQueue([]);
            setProgress(null);
            refreshStats();
            refreshBatches();
        }
    }

    const indexedCount = results.filter(r => r.status === "INDEXED").length;
    const indexRate = results.length ? Math.round((indexedCount / results.length) * 100) : 0;

    return (
        <div className="flex flex-col min-h-screen" style={{ background: "#090c18", color: "#d1d5db" }}>
            {/* ── Dashboard Header ──────────────────────────────────────────── */}
            <header className="sticky top-0 z-40 border-b"
                style={{ background: "rgba(9,12,24,0.9)", backdropFilter: "blur(12px)", borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="max-w-[1300px] mx-auto px-6 py-3 flex items-center justify-between w-full font-sans">
                    <div className="flex items-center gap-3">
                        <Link href="/" className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                                style={{ background: "linear-gradient(135deg, #5b7aff, #4af0c4)" }}>
                                <Zap size={13} fill="white" className="text-white" />
                            </div>
                            <span className="font-bold text-white text-sm">Indexy</span>
                        </Link>
                        <span className="text-[#4b5563] text-xs">·</span>
                        <div>
                            <div className="flex items-center gap-1.5">
                                <LayoutDashboard size={11} className="text-[#5b7aff]" />
                                <span className="text-[11px] font-bold text-[#5b7aff] uppercase tracking-widest">Workspace</span>
                            </div>
                            <div className="text-[9px] text-[#4b5563] uppercase tracking-widest">Pro User Dashboard</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 text-xs text-[#10b981]">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
                            API Connected
                        </div>
                        {user && (
                            <div className="flex items-center gap-2.5">
                                <div>
                                    <div className="text-xs font-semibold text-white text-right">{user.name}</div>
                                    <div className="text-[10px] text-[#5b7aff] text-right capitalize">{user.plan} Plan</div>
                                </div>
                                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
                                    style={{ background: "linear-gradient(135deg, #5b7aff, #4af0c4)" }}>
                                    {user.name.charAt(0).toUpperCase()}
                                </div>
                                <button onClick={handleLogout} title="Log out"
                                    className="p-1.5 rounded-lg text-[#828a9f] hover:text-red-400 transition-colors">
                                    <LogOut size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <main className="flex-1">
                <div className="max-w-[1300px] mx-auto px-6 py-8 space-y-6">

                    {/* ── Stats Row ──────────────────────────────────────────────── */}
                    <div className="grid grid-cols-3 gap-4">
                        {/* Total URLs */}
                        <div className="rounded-2xl p-6" style={{ background: "#0e1120", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <div className="text-[11px] uppercase tracking-widest text-[#828a9f] font-semibold mb-2">Total URLs Checked</div>
                            <div className="flex items-end gap-3">
                                <span className="text-4xl font-black text-white">{stats?.totalChecked.toLocaleString() ?? "—"}</span>
                                <div className="mb-1 p-2 rounded-xl" style={{ background: "rgba(91,122,255,0.1)" }}>
                                    <Link2 size={18} className="text-[#5b7aff]" />
                                </div>
                            </div>
                            <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                                <div className="h-full rounded-full" style={{ background: "linear-gradient(90deg,#5b7aff,#4af0c4)", width: "60%" }} />
                            </div>
                        </div>
                        {/* Avg Index Rate */}
                        <div className="rounded-2xl p-6" style={{ background: "#0e1120", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <div className="text-[11px] uppercase tracking-widest text-[#828a9f] font-semibold mb-2">Avg Index Rate</div>
                            <div className="flex items-end gap-3">
                                <span className="text-4xl font-black text-white">{stats ? `${stats.avgIndexRate}%` : "—"}</span>
                                <div className="mb-1 flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full"
                                    style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}>
                                    <TrendingUp size={10} />
                                    Indexed
                                </div>
                            </div>
                            <div className="text-xs text-[#4b5563] mt-2">Based on your full history</div>
                        </div>
                        {/* Last Checked */}
                        <div className="rounded-2xl p-6" style={{ background: "#0e1120", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <div className="text-[11px] uppercase tracking-widest text-[#828a9f] font-semibold mb-2">Last Checked</div>
                            <div className="text-4xl font-black text-white">{stats ? timeAgo(stats.lastChecked) : "—"}</div>
                            {stats?.lastBatchSize ? (
                                <div className="mt-2 flex items-center gap-1.5 text-xs text-[#5b7aff]">
                                    <Zap size={10} fill="currentColor" />
                                    {stats.lastBatchSize} URLs in last batch
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {/* ── URL Checker ────────────────────────────────────────────── */}
                    <div className="rounded-2xl p-6" style={{ background: "#0e1120", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    <RefreshCw size={16} className="text-[#5b7aff]" />
                                    Check URL Index Status
                                </h2>
                                <p className="text-sm text-[#828a9f] mt-1">Paste your sitemap or list of URLs to verify their Google Index status instantly.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div
                                    onClick={toggleEconomy}
                                    className="group flex items-center gap-2 px-3 py-1.5 rounded-xl border cursor-pointer transition-all active:scale-95"
                                    style={{
                                        background: economyMode ? "rgba(91,122,255,0.1)" : "rgba(255,255,255,0.03)",
                                        borderColor: economyMode ? "rgba(91,122,255,0.4)" : "rgba(255,255,255,0.08)"
                                    }}
                                >
                                    <Zap
                                        size={14}
                                        className={`transition-colors ${economyMode ? "text-[#828a9f]" : "text-[#fbbf24]"}`}
                                        fill={economyMode ? "none" : "currentColor"}
                                    />
                                    <div className="flex flex-col">
                                        <span className={`text-[10px] font-bold leading-none ${economyMode ? "text-[#828a9f]" : "text-white"}`}>FAST MODE</span>
                                        <span className="text-[9px] text-[#4b5563] font-medium">Uses API Credits</span>
                                    </div>
                                    <div
                                        className={`w-7 h-4 rounded-full relative transition-colors ${economyMode ? "bg-[#5b7aff]" : "bg-[#374151]"}`}
                                    >
                                        <div
                                            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${economyMode ? "left-[14px]" : "left-0.5"}`}
                                        />
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className={`text-[10px] font-bold leading-none ${economyMode ? "text-white" : "text-[#828a9f]"}`}>ECONOMY</span>
                                        <span className="text-[9px] text-[#10b981] font-medium">100% Free</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                                    style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", color: "#10b981" }}>
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                                    Unlimited checks enabled
                                </div>
                            </div>
                        </div>
                        <div className="relative">
                            <textarea
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                rows={5}
                                placeholder={"https://example.com/page-1\nhttps://example.com/page-2\nhttps://example.com/blog/new-post"}
                                className="w-full rounded-xl p-4 text-sm font-mono resize-none outline-none text-[#d1d5db] placeholder-[#374151]"
                                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                            />
                            <div className="absolute bottom-3 right-3 text-[10px] text-[#4b5563]">
                                {urlInput.split("\n").filter(Boolean).length} URLs
                            </div>
                        </div>
                        <div className="flex items-center justify-between mt-4">
                            <div className="flex items-center gap-1.5 text-xs text-[#4b5563]">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#5b7aff]" />
                                Powered by real-time Google search verification
                            </div>
                            <button
                                onClick={handleCheck}
                                disabled={isChecking || !urlInput.trim()}
                                className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-50"
                                style={{ background: "linear-gradient(135deg, #5b7aff, #4558e8)" }}
                            >
                                {isChecking ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" />
                                        {progress ? `Checking… (${progress.done} / ${progress.total})` : "Checking…"}
                                    </>
                                ) : (
                                    <>
                                        <Zap size={14} fill="white" />
                                        Check Status
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* ── Queue + Live Results ────────────────────────────────────── */}
                    {(queue.length > 0 || results.length > 0) && (
                        <div className="grid grid-cols-[280px_1fr] gap-4">
                            {/* Processing Queue */}
                            <div className="rounded-2xl p-5" style={{ background: "#0e1120", border: "1px solid rgba(255,255,255,0.06)" }}>
                                <div className="flex items-center gap-2 mb-4">
                                    <Loader2 size={14} className="text-[#5b7aff] animate-spin" />
                                    <span className="text-sm font-bold text-white">Processing Queue</span>
                                </div>
                                <div className="space-y-2.5">
                                    {queue.slice(0, 8).map((item, i) => (
                                        <div key={i} className="flex items-center justify-between gap-2">
                                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${i === 0 ? "bg-[#5b7aff] animate-pulse" : "bg-[#374151]"}`} />
                                            <span className="text-xs text-[#828a9f] truncate flex-1 font-mono"
                                                title={item.url}>.../{item.url.split("/").filter(Boolean).pop()}</span>
                                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${i === 0 ? "text-[#5b7aff]" : "text-[#4b5563]"}`}
                                                style={{ background: i === 0 ? "rgba(91,122,255,0.1)" : "rgba(255,255,255,0.03)" }}>
                                                {i === 0 ? "Checking…" : "Queued"}
                                            </span>
                                        </div>
                                    ))}
                                    {queue.length > 8 && (
                                        <div className="text-xs text-[#4b5563] text-center pt-1">+{queue.length - 8} more queued</div>
                                    )}
                                </div>
                            </div>

                            {/* Live Results */}
                            <div className="rounded-2xl p-5" style={{ background: "#0e1120", border: "1px solid rgba(255,255,255,0.06)" }}>
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-white">Live Results</span>
                                            <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
                                        </div>
                                        {results.length > 0 && (
                                            <div className="text-xs text-[#828a9f] mt-0.5">
                                                {indexedCount} / {results.length} Indexed —{" "}
                                                <span style={{ color: indexRate >= 70 ? "#10b981" : indexRate >= 40 ? "#f59e0b" : "#ef4444" }}>
                                                    {indexRate}% indexed
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {/* Column headers */}
                                <div className="grid grid-cols-[1fr_100px_110px_140px] gap-2 px-2 pb-2 border-b text-[10px] uppercase tracking-widest font-semibold text-[#4b5563]"
                                    style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                                    <span>URL</span><span>Engine</span><span>Status</span><span className="text-right">Details</span>
                                </div>
                                <div className="space-y-1 mt-2 max-h-[280px] overflow-y-auto">
                                    {results.slice(0, 50).map((r, i) => (
                                        <div key={i} className="grid grid-cols-[1fr_100px_110px_140px] gap-2 items-center px-2 py-2.5 rounded-lg hover:bg-white/[0.02] transition-colors">
                                            <span className="text-xs font-mono text-[#d1d5db] truncate" title={r.url}>{r.url}</span>
                                            <div className="text-[9px] font-medium text-[#4b5563] truncate">
                                                {r.engine || "Cache"}
                                            </div>
                                            <div>
                                                {r.status === "INDEXED" ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold"
                                                        style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981" }}>
                                                        <CheckCircle2 size={9} /> INDEXED
                                                    </span>
                                                ) : r.status === "NOT_INDEXED" ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold"
                                                        style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}>
                                                        <XCircle size={9} /> NOT INDEXED
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold"
                                                        style={{ background: "rgba(107,114,128,0.15)", border: "1px solid rgba(107,114,128,0.3)", color: "#9ca3af" }}>
                                                        <AlertCircle size={9} /> ERROR
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-end gap-2">
                                                <span className="text-[10px] text-[#4b5563]">
                                                    {r.status === "INDEXED" ? "Found in Google" :
                                                        r.status === "NOT_INDEXED" ? "Not in Google index" : "Check failed"}
                                                </span>
                                                <a href={`https://www.google.com/search?q=${encodeURIComponent(`site:${toSiteQuery(r.url)}`)}`}
                                                    target="_blank" rel="noopener noreferrer">
                                                    <ExternalLink size={11} className="text-[#4b5563] hover:text-white transition-colors" />
                                                </a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Check History ──────────────────────────────────────────── */}
                    <div className="rounded-2xl" style={{ background: "#0e1120", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                            <div>
                                <div className="font-bold text-white text-sm">Check History</div>
                                <div className="text-xs text-[#4b5563]">Your past batch operations</div>
                            </div>
                            <button onClick={refreshBatches} className="p-1.5 rounded-lg text-[#828a9f] hover:text-white transition-colors">
                                <RefreshCw size={14} />
                            </button>
                        </div>
                        {batches.length === 0 ? (
                            <div className="px-6 py-12 text-center text-sm text-[#4b5563]">
                                No history yet. Run your first check above.
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                                        {["Batch ID", "Date", "Total URLs", "Index Rate", "Actions"].map((h) => (
                                            <th key={h} className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-[#4b5563]">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {batches.map((b, i) => {
                                        const rate = b.total_urls > 0 ? Math.round((b.indexed_count / b.total_urls) * 100) : 0;
                                        return (
                                            <tr key={b.id} className="border-b hover:bg-white/[0.02] transition-colors"
                                                style={{ borderColor: "rgba(255,255,255,0.04)", opacity: i < batches.length - 1 ? 1 : 0.8 }}>
                                                <td className="px-6 py-4 text-sm font-mono font-bold text-[#5b7aff]">#{b.id}</td>
                                                <td className="px-6 py-4 text-xs text-[#828a9f]">{fmtDate(b.created_at)}</td>
                                                <td className="px-6 py-4 text-sm font-semibold text-white">{b.total_urls.toLocaleString()}</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                                                            <div className="h-full rounded-full transition-all"
                                                                style={{
                                                                    width: `${rate}%`,
                                                                    background: rate >= 70 ? "#10b981" : rate >= 40 ? "#f59e0b" : "#ef4444"
                                                                }} />
                                                        </div>
                                                        <span className="text-xs font-bold"
                                                            style={{ color: rate >= 70 ? "#10b981" : rate >= 40 ? "#f59e0b" : "#ef4444" }}>
                                                            {rate}%
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3 text-xs text-[#828a9f]">
                                                        <button
                                                            onClick={() => viewBatchDetails(b.id)}
                                                            disabled={loadingBatch === b.id}
                                                            className="hover:text-white transition-colors flex items-center gap-1 disabled:opacity-50"
                                                        >
                                                            {loadingBatch === b.id ? (
                                                                <Loader2 size={12} className="animate-spin" />
                                                            ) : (
                                                                <ChevronRight size={12} />
                                                            )}
                                                            View
                                                        </button>
                                                        <button className="hover:text-red-400 transition-colors flex items-center gap-1">
                                                            <Trash2 size={12} />Delete
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </main>

            <div className="max-w-[1300px] w-full mx-auto">
                <Footer />
            </div>

            {/* ── Batch Details Modal ───────────────────────────────────────── */}
            {selectedBatch && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={(e) => e.target === e.currentTarget && setSelectedBatch(null)}>
                    <div className="w-full max-w-4xl max-h-[85vh] rounded-2xl overflow-hidden flex flex-col"
                        style={{ background: "#0e1120", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)" }}>
                        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                            <div>
                                <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                    Batch #{selectedBatch.id}
                                    <span className="text-xs font-normal text-[#4b5563]">Results History</span>
                                </h3>
                                <p className="text-sm text-[#828a9f] mt-1">
                                    Showing all {selectedBatch.results.length} URLs processed in this batch.
                                </p>
                            </div>
                            <button onClick={() => setSelectedBatch(null)} className="p-2 rounded-lg text-[#828a9f] hover:text-white hover:bg-white/5 transition-all">
                                <XCircle size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-2">
                            {/* Column headers */}
                            <div className="grid grid-cols-[1fr_120px_140px] gap-2 px-2 pb-2 border-b text-[10px] uppercase tracking-widest font-semibold text-[#4b5563]"
                                style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                                <span>URL</span><span>Status</span><span className="text-right">Action</span>
                            </div>
                            {selectedBatch.results.map((r, i) => (
                                <div key={i} className="grid grid-cols-[1fr_120px_140px] gap-2 items-center px-2 py-3 rounded-lg hover:bg-white/[0.02] transition-colors border-b border-white/[0.02]">
                                    <span className="text-xs font-mono text-[#d1d5db] truncate" title={r.url}>{r.url}</span>
                                    <div>
                                        {r.status === "INDEXED" ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold"
                                                style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981" }}>
                                                <CheckCircle2 size={9} /> INDEXED
                                            </span>
                                        ) : r.status === "NOT_INDEXED" ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold"
                                                style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}>
                                                <XCircle size={9} /> NOT INDEXED
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold"
                                                style={{ background: "rgba(107,114,128,0.15)", border: "1px solid rgba(107,114,128,0.3)", color: "#9ca3af" }}>
                                                <AlertCircle size={9} /> ERROR
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex justify-end">
                                        <a href={`https://www.google.com/search?q=${encodeURIComponent(`site:${toSiteQuery(r.url)}`)}`}
                                            target="_blank" rel="noopener noreferrer"
                                            className="p-1 px-2 rounded-md bg-white/5 text-[10px] font-semibold text-[#828a9f] hover:text-white hover:bg-white/10 transition-all flex items-center gap-1.5">
                                            Verify <ExternalLink size={10} />
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="px-6 py-4 border-t flex justify-end" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                            <button onClick={() => setSelectedBatch(null)} className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-white/5 hover:bg-white/10 transition-all">
                                Close Details
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
