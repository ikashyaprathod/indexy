"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
    Zap, Link2, Clock, CheckCircle2, X,
    AlertCircle, ExternalLink, RefreshCw,
    LogOut, Loader2,
    Filter, Download, Database, Activity,
    Calendar, Copy, Check, Clipboard
} from "lucide-react";
import Link from "next/link";
import Footer from "@/components/Footer";
import { getApiToken } from "@/app/actions/security";

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
    const [authChecked, setAuthChecked] = useState(false);
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
    const [currentBatchId, setCurrentBatchId] = useState<number | null>(null);
    const [checkError, setCheckError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<"ALL" | "INDEXED" | "NOT_INDEXED" | "ERROR">("ALL");
    const [liveUpdate, setLiveUpdate] = useState(true);
    const [copied, setCopied] = useState(false);
    const liveUpdateRef = useRef(true);
    const pendingResultsRef = useRef<ScanResult[]>([]);

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

    const refreshStats = useCallback(() => {
        fetch("/api/dashboard/stats").then(r => r.json()).then(setStats).catch(() => { });
    }, []);
    const refreshBatches = useCallback(() => {
        fetch("/api/dashboard/batches").then(r => r.json()).then(d => setBatches(d.batches ?? [])).catch(() => { });
    }, []);

    // ── Auth check first, then load data ──────────────────────────────────────
    useEffect(() => {
        fetch("/api/auth/me")
            .then(r => r.json())
            .then(d => {
                if (!d.user) {
                    // Full redirect so the proxy sees the correct auth state
                    window.location.href = "/";
                    return;
                }
                setUser(d.user);
                setAuthChecked(true);
                // Only fetch data once we know the user is logged in
                refreshStats();
                refreshBatches();
            })
            .catch(() => { window.location.href = "/"; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        window.location.href = "/";
    }

    // ── Check URLs ─────────────────────────────────────────────────────────────
    async function handleCheck() {
        const urls = urlInput.split("\n").map(u => u.trim()).filter(Boolean);
        if (!urls.length) return;
        setIsChecking(true);
        setResults([]);
        setProgress(null);
        setCurrentBatchId(null);
        setCheckError(null);
        // Build initial queue
        setQueue(urls.map(url => ({ url, status: "queued" as const })));

        try {
            const token = await getApiToken();
            const res = await fetch("/api/check-index", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Indexy-Token": token },
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
                            if (event.batchId) setCurrentBatchId(event.batchId);
                        } else if (event.type === "result") {
                            // Update queue: mark first "queued" as checked
                            setQueue(prev => {
                                const idx = prev.findIndex(q => q.url === event.url);
                                if (idx === -1) return prev;
                                const next = [...prev];
                                next.splice(idx, 1);
                                return next;
                            });
                            if (liveUpdateRef.current) {
                                setResults(prev => [event, ...prev]);
                            } else {
                                pendingResultsRef.current = [event, ...pendingResultsRef.current];
                            }
                            setProgress({ done: event.completed, total: event.total });
                        } else if (event.type === "done") {
                            setProgress(null);
                            setQueue([]);
                            if (pendingResultsRef.current.length > 0) {
                                setResults(prev => [...pendingResultsRef.current, ...prev]);
                                pendingResultsRef.current = [];
                            }
                        }
                    } catch { /* skip malformed */ }
                }
            }
        } catch (err) {
            console.error(err);
            setCheckError(err instanceof Error ? err.message : "Check failed. Please try again.");
        } finally {
            setIsChecking(false);
            setQueue([]);
            setProgress(null);
            refreshStats();
            refreshBatches();
        }
    }

    function toggleLiveUpdate() {
        const next = !liveUpdate;
        setLiveUpdate(next);
        liveUpdateRef.current = next;
        if (next && pendingResultsRef.current.length > 0) {
            setResults(prev => [...pendingResultsRef.current, ...prev]);
            pendingResultsRef.current = [];
        }
    }

    function copyFilteredUrls(filtered: ScanResult[]) {
        const text = filtered.map(r => r.url).join("\n");
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        });
    }

    const indexedCount = results.filter(r => r.status === "INDEXED").length;
    const indexRate = results.length ? Math.round((indexedCount / results.length) * 100) : 0;

    // Hold render until auth is confirmed to prevent flash of empty content
    if (!authChecked) {
        return (
            <div className="flex min-h-screen items-center justify-center" style={{ background: "#05070a" }}>
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 rounded-full border-2 border-[#5b7aff] border-t-transparent animate-spin" />
                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#4b5563]">Loading workspace…</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen font-sans" style={{ background: "#05070a", color: "#d1d5db" }}>
            {/* ── Dashboard Header ──────────────────────────────────────────── */}
            <header className="sticky top-0 z-40 border-b"
                style={{ background: "#05070a", borderColor: "rgba(255,255,255,0.05)" }}>
                <div className="max-w-[1300px] mx-auto px-6 py-4 flex items-center justify-between w-full">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(91,122,255,0.2)]"
                                style={{ background: "linear-gradient(135deg, #1e293b, #0f172a)", border: "1px solid rgba(255,255,255,0.1)" }}>
                                <Database size={18} className="text-[#4af0c4]" />
                            </div>
                            <div className="flex flex-col">
                                <span className="font-black text-white text-lg tracking-tight leading-none">
                                    Indexy <span className="text-[#4af0c4]">Workspace</span>
                                </span>
                                <span className="text-[9px] font-black text-[#4b5563] uppercase tracking-[0.2em] mt-1">Galaxy Edition</span>
                            </div>
                        </Link>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-tight text-[#10b981]"
                            style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.1)" }}>
                            <div className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                            API Connected
                        </div>
                        {user && (
                            <div className="flex items-center gap-3">
                                <div className="text-right">
                                    <div className="text-sm font-bold text-white tracking-tight">{user.name}</div>
                                    <div className="text-[10px] font-black text-[#5b7aff] uppercase tracking-widest mt-0.5">{user.plan} Plan</div>
                                </div>
                                <div className="relative group">
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center p-[2px]"
                                        style={{ background: "linear-gradient(135deg, #5b7aff, #4af0c4)" }}>
                                        <div className="w-full h-full rounded-full bg-[#05070a] flex items-center justify-center overflow-hidden">
                                            <div className="w-full h-full bg-[#1e293b] flex items-center justify-center font-bold text-sm text-white">
                                                {user.name.charAt(0).toUpperCase()}
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={handleLogout} title="Log out"
                                        className="absolute -top-1 -right-1 p-1 bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                                        <LogOut size={10} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <main className="flex-1">
                <div className="max-w-[1300px] mx-auto px-6 py-8 space-y-6">

                    {/* ── Stats Row ──────────────────────────────────────────────── */}
                    <div className="grid grid-cols-3 gap-6">
                        {/* Total URLs */}
                        <div className="relative overflow-hidden rounded-[24px] p-7 transition-all hover:translate-y-[-2px] hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
                            style={{ background: "linear-gradient(145deg, #0e1120, #080a15)", border: "1px solid rgba(255,255,255,0.04)" }}>
                            <div className="relative z-10">
                                <div className="text-[10px] uppercase tracking-[0.2em] text-[#4b5563] font-black mb-1.5">Total URLs Checked</div>
                                <div className="text-4xl font-black text-white tracking-tight">{stats ? stats.totalChecked.toLocaleString() : "—"}</div>
                                {stats && stats.avgIndexRate > 0 && (
                                    <div className="mt-8 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
                                        <div className="h-full rounded-full shadow-[0_0_15px_rgba(91,122,255,0.4)]"
                                            style={{ background: "linear-gradient(90deg, #5b7aff, #4af0c4)", width: `${Math.round(stats.avgIndexRate)}%` }} />
                                    </div>
                                )}
                            </div>
                            <Link2 size={100} className="absolute -right-6 -bottom-6 text-white/[0.02] -rotate-12" />
                        </div>

                        {/* Total Time Saved */}
                        {(() => {
                            const totalSecs = stats ? stats.totalChecked * 20 : 0;
                            const hrs = Math.floor(totalSecs / 3600);
                            const mins = Math.floor((totalSecs % 3600) / 60);
                            return (
                                <div className="relative overflow-hidden rounded-[24px] p-7 transition-all hover:translate-y-[-2px] hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
                                    style={{ background: "linear-gradient(145deg, #0e1120, #080a15)", border: "1px solid rgba(255,255,255,0.04)" }}>
                                    <div className="relative z-10">
                                        <div className="text-[10px] uppercase tracking-[0.2em] text-[#4b5563] font-black mb-1.5">Total Time Saved</div>
                                        <div className="text-4xl font-black text-white tracking-tight">
                                            {stats ? `${hrs}h` : "—"}
                                            <span className="text-2xl text-[#4b5563]">{stats ? ` ${mins}m` : ""}</span>
                                        </div>
                                        <div className="text-[10px] text-[#4b5563] font-medium mt-2">Estimated at 20s per manual check</div>
                                    </div>
                                    <Clock size={100} className="absolute -right-6 -bottom-6 text-white/[0.02] -rotate-12" />
                                </div>
                            );
                        })()}

                        {/* Last Checked */}
                        <div className="relative overflow-hidden rounded-[24px] p-7 transition-all hover:translate-y-[-2px] hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
                            style={{ background: "linear-gradient(145deg, #0e1120, #080a15)", border: "1px solid rgba(255,255,255,0.04)" }}>
                            <div className="relative z-10">
                                <div className="text-[10px] uppercase tracking-[0.2em] text-[#4b5563] font-black mb-1.5">Last Checked</div>
                                <div className="text-4xl font-black text-white tracking-tight">
                                    {stats ? timeAgo(stats.lastChecked).split(' ')[0] : "—"}
                                    <span className="text-2xl text-[#4b5563]"> {stats ? timeAgo(stats.lastChecked).split(' ').slice(1).join(' ') : ""}</span>
                                </div>
                                {stats?.lastBatchSize ? (
                                    <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold text-[#5b7aff]"
                                        style={{ background: "rgba(91,122,255,0.05)", border: "1px solid rgba(91,122,255,0.1)" }}>
                                        <Database size={11} fill="currentColor" opacity={0.3} />
                                        {stats.lastBatchSize} URLs in last batch
                                    </div>
                                ) : null}
                            </div>
                            <Calendar size={100} className="absolute -right-6 -bottom-6 text-white/[0.02] -rotate-12" />
                        </div>
                    </div>

                    {/* ── URL Checker ────────────────────────────────────────────── */}
                    <div className="rounded-[24px] p-7" style={{ background: "linear-gradient(145deg, #0e1120, #080a15)", border: "1px solid rgba(255,255,255,0.04)" }}>
                        <div className="flex items-start justify-between mb-6">
                            <div className="flex gap-4">
                                <div className="w-12 h-12 rounded-2xl flex items-center justify-center p-3"
                                    style={{ background: "rgba(91,122,255,0.1)", border: "1px solid rgba(91,122,255,0.2)" }}>
                                    <Activity size={24} className="text-[#5b7aff]" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-white tracking-tight">Check URL Index Status</h2>
                                    <p className="text-sm text-[#4b5563] font-medium mt-1">Paste your sitemap or list of URLs below to verify their Google Index status instantly.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest"
                                style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)", color: "#10b981" }}>
                                <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] shadow-[0_0_5px_#10b981]" />
                                Unlimited checks enabled
                            </div>
                        </div>

                        <div className="relative group">
                            <textarea
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                rows={6}
                                placeholder={"https://example.com/page-1\nhttps://example.com/page-2\nhttps://example.com/blog/new-post"}
                                className="w-full rounded-2xl p-6 text-sm font-mono tracking-tight resize-none outline-none text-white placeholder-[#1e293b] transition-all"
                                style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.05)" }}
                            />
                            <div className="absolute bottom-4 right-4 px-2 py-1 rounded-md bg-black/40 text-[10px] font-black text-[#4b5563] uppercase tracking-widest border border-white/5">
                                {urlInput.split("\n").filter(Boolean).length} URLs
                            </div>
                        </div>

                        <div className="flex items-center justify-between mt-6">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 text-[10px] font-black text-[#4b5563] uppercase tracking-widest">
                                    <CheckCircle2 size={12} className="text-[#5b7aff]" />
                                    Powered by real-time Google search verification
                                </div>
                                <button
                                    onClick={toggleEconomy}
                                    title="Economy mode uses local browser scraping instead of the Serper API"
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                                    style={economyMode
                                        ? { background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#f59e0b" }
                                        : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#4b5563" }
                                    }
                                >
                                    <Zap size={10} fill={economyMode ? "currentColor" : "none"} />
                                    Economy
                                </button>
                            </div>
                            <button
                                onClick={handleCheck}
                                disabled={isChecking || !urlInput.trim()}
                                className="flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-[15px] text-white transition-all disabled:opacity-50 hover:shadow-[0_10px_30px_rgba(91,122,255,0.3)] hover:scale-[1.02] active:scale-[0.98]"
                                style={{ background: "linear-gradient(135deg, #5b7aff, #4558e8)" }}
                            >
                                {isChecking ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        {progress ? `Checking… (${progress.done} / ${progress.total})` : "Checking…"}
                                    </>
                                ) : (
                                    <>
                                        <Zap size={18} fill="white" />
                                        Check Status
                                    </>
                                )}
                            </button>
                        </div>

                        {checkError && (
                            <div className="mt-4 flex items-center gap-2 p-4 rounded-xl text-sm text-red-400"
                                style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}>
                                <AlertCircle size={15} className="shrink-0" />
                                {checkError}
                            </div>
                        )}
                    </div>

                    {/* ── Queue + Live Results ────────────────────────────────────── */}
                    {(queue.length > 0 || results.length > 0) && (
                        <div className="grid grid-cols-[340px_1fr] gap-6">
                            {/* Processing Queue */}
                            <div className="rounded-[24px] p-8" style={{ background: "linear-gradient(165deg, #0e1120, #060812)", border: "1px solid rgba(255,255,255,0.04)" }}>
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-10 h-10 rounded-[12px] bg-[#5b7aff]/10 flex items-center justify-center border border-[#5b7aff]/10">
                                        <RefreshCw size={18} className={`text-[#5b7aff] ${isChecking ? "animate-spin" : ""}`} />
                                    </div>
                                    <span className="text-base font-black text-white uppercase tracking-[0.05em] drop-shadow-sm">Processing Queue</span>
                                </div>
                                <div className="space-y-4">
                                    {queue.length > 0 ? (
                                        queue.slice(0, 8).map((item, i) => (
                                            <div key={i} className={`flex items-center justify-between gap-4 p-4 rounded-2xl border transition-all duration-300 ${i === 0 ? "bg-[#5b7aff]/5 border-[#5b7aff]/30 shadow-[0_4px_20px_rgba(91,122,255,0.1)]" : "bg-white/[0.02] border-white/[0.03] opacity-60"}`}>
                                                <div className="flex items-center gap-3 truncate">
                                                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${i === 0 ? "bg-[#5b7aff] shadow-[0_0_10px_#5b7aff]" : "bg-[#1e293b]"}`} />
                                                    <span className={`text-[13px] truncate font-mono tracking-tight ${i === 0 ? "text-white" : "text-[#828a9f]"}`} title={item.url}>
                                                        .../{item.url.split("/").filter(Boolean).pop()}
                                                    </span>
                                                </div>
                                                <span className={`text-[10px] font-black uppercase tracking-[0.1em] ${i === 0 ? "text-[#5b7aff]" : "text-[#4b5563]"}`}>
                                                    {i === 0 ? "Scanning..." : i === 1 ? "Waiting" : "Queued"}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-16 opacity-30">
                                            <div className="text-xs font-black uppercase tracking-[0.2em]">Queue Empty</div>
                                        </div>
                                    )}
                                    {queue.length > 8 && (
                                        <div className="text-[11px] text-[#4b5563] font-black uppercase tracking-[0.2em] text-center pt-2">
                                            +{queue.length - 8} more in queue
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Live Results */}
                            <div className="rounded-[24px] p-8" style={{ background: "linear-gradient(165deg, #0e1120, #060812)", border: "1px solid rgba(255,255,255,0.04)" }}>
                                {/* Row 1: title + Live Update toggle */}
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-base font-black text-white uppercase tracking-[0.05em]">Live Results</h3>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[11px] font-black uppercase tracking-[0.15em]"
                                            style={{ color: liveUpdate ? "#4b5563" : "#ef4444" }}>
                                            {liveUpdate ? "Live Update" : "Paused"}
                                        </span>
                                        <button
                                            onClick={toggleLiveUpdate}
                                            className="relative w-10 h-5 rounded-full flex items-center px-1 transition-all"
                                            style={{
                                                background: liveUpdate ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                                                border: liveUpdate ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(239,68,68,0.2)",
                                                boxShadow: liveUpdate ? "0 0 10px rgba(16,185,129,0.1)" : "none",
                                            }}
                                            title={liveUpdate ? "Pause live updates" : "Resume live updates"}
                                        >
                                            <div className="w-3 h-3 rounded-full transition-all duration-300"
                                                style={{
                                                    background: liveUpdate ? "#10b981" : "#ef4444",
                                                    boxShadow: liveUpdate ? "0 0 8px #10b981" : "0 0 8px #ef4444",
                                                    marginLeft: liveUpdate ? "auto" : "0",
                                                }} />
                                        </button>
                                        {!liveUpdate && pendingResultsRef.current.length > 0 && (
                                            <span className="text-[10px] font-black text-[#ef4444] uppercase tracking-widest animate-pulse">
                                                +{pendingResultsRef.current.length} pending
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Row 2: batch info + filter pills + copy button */}
                                <div className="flex items-center justify-between mb-6">
                                    <div className="text-[11px] font-black uppercase tracking-[0.2em]">
                                        <span className="text-[#4b5563]">Batch</span> <span className="text-[#5b7aff]">{currentBatchId ? `#${currentBatchId}` : "#—"}</span> <span className="mx-2 text-white/5">—</span> <span className="text-[#10b981]">{indexRate}% Indexed</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {([
                                            { key: "ALL", label: "All", count: results.length },
                                            { key: "INDEXED", label: "Indexed", count: results.filter(r => r.status === "INDEXED").length },
                                            { key: "NOT_INDEXED", label: "Not Indexed", count: results.filter(r => r.status === "NOT_INDEXED").length },
                                            { key: "ERROR", label: "Error", count: results.filter(r => r.status === "ERROR").length },
                                        ] as const).map(({ key, label, count }) => (
                                            <button
                                                key={key}
                                                onClick={() => setStatusFilter(key)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                                                style={statusFilter === key ? {
                                                    background: key === "INDEXED" ? "rgba(16,185,129,0.12)" : key === "NOT_INDEXED" ? "rgba(239,68,68,0.12)" : key === "ERROR" ? "rgba(107,114,128,0.12)" : "rgba(91,122,255,0.12)",
                                                    border: `1px solid ${key === "INDEXED" ? "rgba(16,185,129,0.3)" : key === "NOT_INDEXED" ? "rgba(239,68,68,0.3)" : key === "ERROR" ? "rgba(107,114,128,0.3)" : "rgba(91,122,255,0.3)"}`,
                                                    color: key === "INDEXED" ? "#10b981" : key === "NOT_INDEXED" ? "#ef4444" : key === "ERROR" ? "#9ca3af" : "#5b7aff",
                                                } : {
                                                    background: "rgba(255,255,255,0.02)",
                                                    border: "1px solid rgba(255,255,255,0.05)",
                                                    color: "#4b5563",
                                                }}
                                            >
                                                {label}
                                                <span className="px-1 py-0.5 rounded text-[9px] font-black"
                                                    style={{ background: "rgba(255,255,255,0.06)" }}>
                                                    {count}
                                                </span>
                                            </button>
                                        ))}
                                        <div className="w-px h-4 mx-1" style={{ background: "rgba(255,255,255,0.06)" }} />
                                        {/* Copy filtered URLs */}
                                        {(() => {
                                            const filtered = statusFilter === "ALL" ? results : results.filter(r => r.status === statusFilter);
                                            return (
                                                <button
                                                    onClick={() => copyFilteredUrls(filtered)}
                                                    disabled={filtered.length === 0}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
                                                    style={copied ? {
                                                        background: "rgba(16,185,129,0.12)",
                                                        border: "1px solid rgba(16,185,129,0.3)",
                                                        color: "#10b981",
                                                    } : {
                                                        background: "rgba(255,255,255,0.02)",
                                                        border: "1px solid rgba(255,255,255,0.05)",
                                                        color: "#4b5563",
                                                    }}
                                                    title={`Copy ${filtered.length} URL${filtered.length !== 1 ? "s" : ""}`}
                                                >
                                                    {copied ? <Check size={13} /> : <Clipboard size={13} />}
                                                </button>
                                            );
                                        })()}
                                    </div>
                                </div>

                                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                    <div className="grid grid-cols-[1fr_150px_160px] gap-6 px-4 pb-4 border-b border-white/[0.04] text-[10px] uppercase tracking-[0.3em] font-black text-[#4b5563]">
                                        <span>URL</span>
                                        <span className="text-center">Status</span>
                                        <span className="text-right">Details</span>
                                    </div>
                                    {results.length === 0 ? (
                                        <div className="text-center py-24 text-xs text-[#4b5563] font-black uppercase tracking-[0.2em] animate-pulse">
                                            Waiting for data feed...
                                        </div>
                                    ) : (() => {
                                        const filtered = statusFilter === "ALL" ? results : results.filter(r => r.status === statusFilter);
                                        return filtered.length === 0 ? (
                                            <div className="text-center py-16 text-xs text-[#4b5563] font-black uppercase tracking-[0.2em]">
                                                No {statusFilter.toLowerCase().replace("_", " ")} results
                                            </div>
                                        ) : filtered.map((r, i) => (
                                            <div key={i} className="grid grid-cols-[1fr_150px_160px] gap-6 items-center px-4 py-6 border-b border-white/[0.02] last:border-0 hover:bg-white/[0.01] transition-all group">
                                                <span className="text-sm font-black font-mono text-white/90 truncate tracking-tight" title={r.url}>{r.url}</span>
                                                <div className="flex justify-center">
                                                    {r.status === "INDEXED" ? (
                                                        <span className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-[10px] text-[10px] font-black uppercase tracking-[0.1em]"
                                                            style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", color: "#10b981", boxShadow: "0 0 15px rgba(16,185,129,0.05)" }}>
                                                            <div className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]" />
                                                            INDEXED
                                                        </span>
                                                    ) : r.status === "NOT_INDEXED" ? (
                                                        <span className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-[10px] text-[10px] font-black uppercase tracking-[0.1em]"
                                                            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", boxShadow: "0 0 15px rgba(239,68,68,0.05)" }}>
                                                            <div className="w-2 h-2 rounded-full bg-[#ef4444] shadow-[0_0_8px_#ef4444]" />
                                                            NOT INDEXED
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-[10px] text-[10px] font-black uppercase tracking-[0.1em]"
                                                            style={{ background: "rgba(107,114,128,0.08)", border: "1px solid rgba(107,114,128,0.2)", color: "#9ca3af" }}>
                                                            <div className="w-2 h-2 rounded-full bg-[#9ca3af]" />
                                                            ERROR
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-end gap-2">
                                                    <span className="text-[11px] font-black text-[#4b5563] uppercase tracking-tight group-hover:text-white/60 transition-colors">
                                                        {r.checked_at ? new Date(r.checked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                                                    </span>
                                                    <button
                                                        onClick={() => navigator.clipboard.writeText(r.url)}
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md text-[#4b5563] hover:text-white hover:bg-white/10"
                                                        title="Copy URL"
                                                    >
                                                        <Copy size={11} />
                                                    </button>
                                                </div>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Check History ──────────────────────────────────────────── */}
                    <div className="rounded-[24px]" style={{ background: "linear-gradient(145deg, #0e1120, #080a15)", border: "1px solid rgba(255,255,255,0.04)" }}>
                        <div className="flex items-center justify-between px-8 py-6 border-b border-white/[0.03]">
                            <div>
                                <div className="text-sm font-black text-white uppercase tracking-widest">Check History</div>
                                <div className="text-[10px] text-[#4b5563] font-black uppercase tracking-[0.2em] mt-1">Your past batch operations</div>
                            </div>
                            <div className="flex items-center gap-4">
                                <button className="p-2 rounded-xl text-[#4b5563] hover:text-white hover:bg-white/5 transition-all">
                                    <Filter size={16} />
                                </button>
                                <button className="p-2 rounded-xl text-[#4b5563] hover:text-white hover:bg-white/5 transition-all">
                                    <Download size={16} />
                                </button>
                                <div className="w-px h-6 bg-white/5" />
                                <button onClick={refreshBatches} className="p-2 rounded-xl text-[#4b5563] hover:text-[#5b7aff] hover:bg-[#5b7aff]/5 transition-all">
                                    <RefreshCw size={16} />
                                </button>
                            </div>
                        </div>

                        {batches.length === 0 ? (
                            <div className="px-8 py-20 text-center">
                                <div className="text-xs text-[#4b5563] font-black uppercase tracking-widest">No history yet</div>
                                <p className="text-[10px] text-[#2d3748] mt-1 uppercase tracking-widest font-black">Run your first check above</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b border-white/[0.03]">
                                            {["Batch ID", "Date", "Total URLs", "Index Rate", "Actions"].map((h) => (
                                                <th key={h} className="px-8 py-5 text-[10px] uppercase tracking-[0.2em] font-black text-[#4b5563]">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/[0.03]">
                                        {batches.map((b, i) => {
                                            const rate = b.total_urls > 0 ? Math.round((b.indexed_count / b.total_urls) * 100) : 0;
                                            return (
                                                <tr key={b.id} className="hover:bg-white/[0.01] transition-colors group">
                                                    <td className="px-8 py-5 text-sm font-black font-mono text-[#5b7aff]">#{b.id}</td>
                                                    <td className="px-8 py-5">
                                                        <div className="text-xs font-black text-[#d1d5db] uppercase tracking-tight">{fmtDate(b.created_at)}</div>
                                                        <div className="text-[10px] text-[#4b5563] font-black mt-0.5">{new Date(b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
                                                    </td>
                                                    <td className="px-8 py-5 text-sm font-black text-white">{b.total_urls.toLocaleString()}</td>
                                                    <td className="px-8 py-5">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-28 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
                                                                <div className="h-full rounded-full transition-all duration-1000"
                                                                    style={{
                                                                        width: `${rate}%`,
                                                                        background: rate >= 70 ? "linear-gradient(90deg, #10b981, #34d399)" :
                                                                            rate >= 40 ? "linear-gradient(90deg, #f59e0b, #fbbf24)" :
                                                                                "linear-gradient(90deg, #ef4444, #f87171)",
                                                                        boxShadow: `0 0 10px ${rate >= 70 ? "#10b98144" : rate >= 40 ? "#f59e0b44" : "#ef444444"}`
                                                                    }} />
                                                            </div>
                                                            <span className="text-[11px] font-black"
                                                                style={{ color: rate >= 70 ? "#10b981" : rate >= 40 ? "#f59e0b" : "#ef4444" }}>
                                                                {rate}%
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <button
                                                            onClick={() => viewBatchDetails(b.id)}
                                                            disabled={loadingBatch === b.id}
                                                            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#4b5563] hover:text-white transition-all disabled:opacity-50"
                                                        >
                                                            {loadingBatch === b.id ? (
                                                                <Loader2 size={11} className="animate-spin" />
                                                            ) : (
                                                                <ExternalLink size={11} />
                                                            )}
                                                            View
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
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
                                <X size={20} />
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
                                                <X size={9} /> NOT INDEXED
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
