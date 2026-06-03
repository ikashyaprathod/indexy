"use client";

import React, { useState, useEffect } from "react";
import {
    Link2, Users, UserPlus, Zap, Settings, Bell,
    Search, ShieldCheck, Monitor,
    RefreshCw, X,
    Globe, Clock, UserCheck
} from "lucide-react";
import { verifyAdminPasskey, checkAdminAuthorization } from "@/app/actions/adminAuth";

interface AdminUser {
    id: number;
    name: string;
    email: string;
    role: string;
    plan: string;
}

export default function AdminDashboard() {
    const [stats, setStats] = useState<any>(null);
    const [users, setUsers] = useState<any[]>([]);
    const [recentChecks, setRecentChecks] = useState<any[]>([]);
    const [config, setConfig] = useState<{ guest_mode: boolean; public_signup: boolean; live_update: boolean }>({ guest_mode: true, public_signup: true, live_update: true });
    const [premiumEmail, setPremiumEmail] = useState("");
    const [dataLoading, setDataLoading] = useState(true);
    const [pin, setPin] = useState("");
    const [pinSubmitting, setPinSubmitting] = useState(false);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [pinError, setPinError] = useState(false);
    const [adminUser, setAdminUser] = useState<AdminUser | null>(null);

    useEffect(() => {
        // Fetch the logged-in admin's info
        fetch("/api/auth/me")
            .then(r => r.json())
            .then(d => { if (d.user) setAdminUser(d.user); })
            .catch(() => {});

        // Start data fetch immediately (parallel with cookie check — data is ready by the time PIN is entered)
        fetchAdminData();

        // Check if already passkey-authorized (cookie persists for 2h)
        checkAdminAuthorization().then(authorized => {
            if (authorized) setIsAuthorized(true);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Live Update Auto-Refresh
    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
        if (config.live_update) {
            interval = setInterval(() => {
                fetchAdminData();
            }, 10000); // Refresh every 10s
        }
        return () => clearInterval(interval);
    }, [config.live_update]);

    const fetchAdminData = async () => {
        setDataLoading(true);
        try {
            const [statsRes, configRes, usersRes] = await Promise.all([
                fetch("/api/admin/stats"),
                fetch("/api/admin/config"),
                fetch("/api/admin/users"),
            ]);

            if (statsRes.ok) {
                const s = await statsRes.json();
                setStats(s.stats);
                setRecentChecks(s.recentChecks);
            }
            if (configRes.ok) {
                const apiConfig = await configRes.json();
                setConfig(prev => ({ ...prev, ...apiConfig }));
            }
            if (usersRes.ok) {
                const u = await usersRes.json();
                setUsers(u.users);
            }
        } catch (err) {
            console.error("Failed to fetch admin data", err);
        } finally {
            setDataLoading(false);
        }
    };

    const toggleConfig = async (key: keyof typeof config) => {
        const newConfig = { ...config, [key]: !config[key] };
        setConfig(newConfig);
        await fetch("/api/admin/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newConfig),
        });
    };

    const handleAddPremium = async () => {
        if (!premiumEmail) return;
        await fetch("/api/admin/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: premiumEmail, plan: "premium" }),
        });
        setPremiumEmail("");
        fetchAdminData();
    };

    const handleRemovePremium = async (email: string) => {
        await fetch("/api/admin/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, plan: "free" }),
        });
        fetchAdminData();
    };

    const handlePinSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pin.trim()) return;
        setPinSubmitting(true);
        setPinError(false);
        try {
            const result = await verifyAdminPasskey(pin);
            if (result.success) {
                setIsAuthorized(true);
                // Data is already loading in the background from mount; just refresh
                fetchAdminData();
            } else {
                setPinError(true);
                setPin("");
            }
        } finally {
            setPinSubmitting(false);
        }
    };

    // Show passkey gate immediately — no spinner before it
    if (!isAuthorized) {
        return (
            <div className="min-h-screen bg-[#05070a] flex items-center justify-center font-['Inter']">
                <div className="w-full max-w-md p-10 rounded-[40px] border border-white/[0.05]" style={{ background: "linear-gradient(145deg, #0e1120, #080a15)" }}>
                    <div className="flex flex-col items-center text-center">
                        <div className="w-16 h-16 bg-[#5b7aff]/10 rounded-2xl flex items-center justify-center mb-6 border border-[#5b7aff]/20 text-[#5b7aff]">
                            <ShieldCheck size={32} />
                        </div>
                        <h1 className="text-2xl font-black text-white uppercase tracking-widest mb-2">Secure Access</h1>
                        <p className="text-sm text-[#4b5563] font-black uppercase tracking-widest mb-8">Enter Admin Passkey</p>

                        <form onSubmit={handlePinSubmit} className="w-full space-y-4">
                            <input
                                type="password"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                placeholder="••••••"
                                disabled={pinSubmitting}
                                className={`w-full bg-white/[0.02] border ${pinError ? 'border-red-500/50' : 'border-white/[0.05]'} rounded-2xl px-6 py-4 text-center text-2xl tracking-[0.5em] text-white focus:outline-none focus:border-[#5b7aff]/40 transition-all disabled:opacity-50`}
                                autoFocus
                            />
                            {pinError && <p className="text-xs text-red-400 font-bold uppercase tracking-widest">Invalid Security Passkey</p>}
                            <button
                                type="submit"
                                disabled={pinSubmitting || !pin.trim()}
                                className="w-full bg-[#5b7aff] hover:bg-[#4a69ee] disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(91,122,255,0.3)] flex items-center justify-center gap-2"
                            >
                                {pinSubmitting ? (
                                    <><RefreshCw size={16} className="animate-spin" /> Verifying…</>
                                ) : (
                                    "Authorize Dashboard"
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    // Show data loading spinner only after auth is confirmed
    if (dataLoading && !stats) {
        return (
            <div className="min-h-screen bg-[#05070a] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <RefreshCw className="text-[#5b7aff] animate-spin" size={32} />
                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#4b5563]">Loading admin data…</span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#05070a] text-[#d1d5db] font-['Inter']">
            {/* ── Admin Header ──────────────────────────────────────────── */}
            <header className="sticky top-0 z-40 border-b border-white/[0.05]" style={{ background: "#05070a" }}>
                <div className="max-w-[1400px] mx-auto px-8 py-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#5b7aff] rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(91,122,255,0.3)]">
                            <ShieldCheck size={24} className="text-white" />
                        </div>
                        <div>
                            <span className="text-xl font-black text-white uppercase tracking-widest">Indexy Admin</span>
                            <div className="flex items-center gap-2 mt-0.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] shadow-[0_0_5px_#10b981]" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#4b5563]">System Operational</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.05]">
                            <Bell size={16} className="text-[#4b5563]" />
                            <div className="w-4 h-4 rounded-full bg-[#5b7aff] text-[9px] font-black text-white flex items-center justify-center">2</div>
                        </div>
                        <Settings size={20} className="text-[#4b5563] hover:text-white cursor-pointer transition-colors" />
                        <div className="h-8 w-[1px] bg-white/[0.05]" />
                        <div className="flex items-center gap-3">
                            <div className="text-right">
                                <div className="text-sm font-black text-white">{adminUser?.name || "Admin User"}</div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-[#5b7aff]">
                                    {adminUser?.role || "admin"} {adminUser?.email && `(${adminUser.email})`}
                                </div>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#5b7aff] to-[#3b82f6] border-2 border-[#1e293b]" />
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-[1400px] mx-auto px-8 py-10 space-y-10">
                {/* ── Stats Row ─────────────────────────────────────────── */}
                <div className="grid grid-cols-4 gap-6">
                    {[
                        { label: "Total URLs Checked", value: stats?.totalUrls?.toLocaleString() || "0", icon: Link2, color: "#5b7aff" },
                        { label: "Total Users", value: stats?.totalUsers?.toLocaleString() || "0", icon: Users, color: "#a855f7" },
                        { label: "Guest Users (24h)", value: stats?.guestUsers24h?.toLocaleString() || "0", icon: Monitor, color: "#f59e0b", badge: "+12%" },
                        { label: "New Users (7d)", value: stats?.newUsers7d?.toLocaleString() || "0", icon: UserPlus, color: "#10b981", badge: "+5%" }
                    ].map((s, i) => (
                        <div key={i} className="rounded-[24px] p-8 relative overflow-hidden group" style={{ background: "linear-gradient(145deg, #0e1120, #080a15)", border: "1px solid rgba(255,255,255,0.04)" }}>
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${s.color}10`, border: `1px solid ${s.color}20` }}>
                                    <s.icon size={22} style={{ color: s.color }} />
                                </div>
                                {s.badge && (
                                    <div className="px-2 py-1 rounded-lg text-[10px] font-black" style={{ background: `${s.color}15`, color: s.color }}>
                                        {s.badge}
                                    </div>
                                )}
                            </div>
                            <div className="text-xs font-black text-[#4b5563] uppercase tracking-[0.15em] mb-1">{s.label}</div>
                            <div className="text-3xl font-black text-white tracking-tight">{s.value}</div>
                        </div>
                    ))}
                </div>

                {/* ── Middle Section: Logs & Config ────────────────────────── */}
                <div className="grid grid-cols-3 gap-8">
                    {/* Recent Checks */}
                    <div className="col-span-2 rounded-[32px] p-8" style={{ background: "linear-gradient(165deg, #0e1120, #060812)", border: "1px solid rgba(255,255,255,0.04)" }}>
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-3">
                                    <Clock size={20} className="text-[#5b7aff]" />
                                    Recent Checks
                                </h3>
                                <p className="text-[10px] font-black text-[#4b5563] uppercase tracking-[0.2em] mt-1">Global audit of indexing activity</p>
                            </div>
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4b5563]" />
                                <input placeholder="Search IP or Email..." className="bg-white/[0.02] border border-white/[0.05] rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-[#5b7aff]/40 transition-all w-60" />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 px-4 pb-4 text-[10px] font-black text-[#4b5563] uppercase tracking-[0.3em]">
                                <span>User Email / IP</span>
                                <span className="text-center">URLs Checked</span>
                                <span className="text-center">Index Rate %</span>
                                <span className="text-right">Timestamp</span>
                            </div>
                            <div className="max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                                {recentChecks.map((log, i) => (
                                    <div key={i} className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 items-center px-4 py-5 border-b border-white/[0.02] last:border-0 hover:bg-white/[0.01] transition-all group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-white/[0.03] flex items-center justify-center text-xs font-black text-[#5b7aff]">
                                                {log.email[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="text-sm font-black text-white truncate max-w-[180px]">{log.email}</div>
                                                <div className="text-[10px] font-black uppercase text-[#4b5563] tracking-widest">{log.plan}</div>
                                            </div>
                                        </div>
                                        <div className="text-center font-mono text-sm font-black text-white">{log.total_urls}</div>
                                        <div className="flex justify-center">
                                            {(() => {
                                                const rate = log.total_urls > 0 ? Math.round((log.indexed_count / log.total_urls) * 100) : 0;
                                                return (
                                                    <>
                                                        <div className="w-24 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-[#10b981] shadow-[0_0_8px_#10b981]"
                                                                style={{ width: `${rate}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-[10px] font-black text-[#10b981] ml-2">
                                                            {rate}%
                                                        </span>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                        <div className="text-right text-[11px] font-black text-[#4b5563] uppercase">
                                            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Global Controls & Premium Manager */}
                    <div className="space-y-8">
                        {/* Global Controls */}
                        <div className="rounded-[32px] p-8" style={{ background: "linear-gradient(165deg, #0e1120, #060812)", border: "1px solid rgba(255,255,255,0.04)" }}>
                            <h3 className="text-base font-black text-white uppercase tracking-widest flex items-center gap-3 mb-1">
                                <Globe size={18} className="text-[#5b7aff]" />
                                Global Controls
                            </h3>
                            <p className="text-[10px] font-black text-[#4b5563] uppercase tracking-[0.2em] mb-8">Manage system-wide access</p>

                            <div className="space-y-6">
                                {[
                                    { id: 'guest_mode' as const, label: 'Guest Mode', sub: 'Allow unregistered checks' },
                                    { id: 'public_signup' as const, label: 'Public Signup', sub: 'Allow new registrations' },
                                    { id: 'live_update' as const, label: 'Live Update', sub: 'Auto-refresh every 10s' }
                                ].map((ctrl, i) => (
                                    <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/[0.03]">
                                        <div>
                                            <div className="text-sm font-black text-white">{ctrl.label}</div>
                                            <div className="text-[10px] text-[#4b5563] uppercase font-black tracking-widest mt-0.5">{ctrl.sub}</div>
                                        </div>
                                        <button onClick={() => toggleConfig(ctrl.id)}>
                                            {config[ctrl.id] ? (
                                                <div className="w-10 h-5 bg-[#5b7aff] rounded-full relative flex items-center px-1">
                                                    <div className="w-3 h-3 bg-white rounded-full ml-auto shadow-[0_0_5px_white]" />
                                                </div>
                                            ) : (
                                                <div className="w-10 h-5 bg-[#1e293b] rounded-full relative flex items-center px-1">
                                                    <div className="w-3 h-3 bg-[#4b5563] rounded-full" />
                                                </div>
                                            )}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Premium Manager */}
                        <div className="rounded-[32px] p-8" style={{ background: "linear-gradient(165deg, #0e1120, #060812)", border: "1px solid rgba(255,255,255,0.04)" }}>
                            <h3 className="text-base font-black text-white uppercase tracking-widest flex items-center gap-3 mb-1">
                                <Zap size={18} className="text-[#a855f7]" />
                                Premium Manager
                            </h3>
                            <p className="text-[10px] font-black text-[#4b5563] uppercase tracking-[0.2em] mb-8">Grant unlimited bypass access</p>

                            <div className="space-y-6">
                                <div className="space-y-1.5">
                                    <div className="text-[10px] font-black text-[#4b5563] uppercase tracking-widest ml-1">Add Premium User</div>
                                    <div className="flex gap-2">
                                        <input
                                            value={premiumEmail}
                                            onChange={(e) => setPremiumEmail(e.target.value)}
                                            placeholder="user@example.com"
                                            className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#a855f7]/40 flex-1"
                                        />
                                        <button
                                            onClick={handleAddPremium}
                                            className="bg-[#a855f7] hover:bg-[#9333ea] text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                                        >
                                            Add
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3 pt-2">
                                    <div className="text-[10px] font-black text-[#4b5563] uppercase tracking-widest ml-1">Active Premium Users</div>
                                    <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                                        {users.filter(u => u.plan === 'premium').map((u, i) => (
                                            <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.03] group">
                                                <div className="flex items-center gap-2 truncate">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] shadow-[0_0_5px_#10b981]" />
                                                    <span className="text-[11px] font-black text-white/90 truncate">{u.email}</span>
                                                </div>
                                                <X
                                                    size={14}
                                                    className="text-[#4b5563] hover:text-red-400 cursor-pointer opacity-0 group-hover:opacity-100 transition-all"
                                                    onClick={() => handleRemovePremium(u.email)}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── User Directory ─────────────────────────────────────── */}
                <div className="rounded-[32px] p-8" style={{ background: "linear-gradient(165deg, #0e1120, #060812)", border: "1px solid rgba(255,255,255,0.04)" }}>
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
                                <Users size={24} className="text-[#a855f7]" />
                                All Users Directory
                            </h3>
                            <p className="text-[10px] font-black text-[#4b5563] uppercase tracking-[0.2em] mt-1">Manage global user accounts</p>
                        </div>
                        <button className="px-5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05] text-[10px] font-black uppercase tracking-widest text-[#d1d5db] hover:bg-white/[0.05] transition-all">
                            Export CSV
                        </button>
                    </div>

                    <div className="space-y-1">
                        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-6 px-4 pb-4 text-[10px] font-black text-[#4b5563] uppercase tracking-[0.3em]">
                            <span>Email</span>
                            <span className="text-center">Role</span>
                            <span className="text-center">Signup Date</span>
                            <span className="text-center">Total Checks</span>
                            <span className="text-right">Status</span>
                        </div>
                        <div className="max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
                            {users.map((user, i) => (
                                <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-6 items-center px-4 py-6 border-b border-white/[0.02] last:border-0 hover:bg-white/[0.01] transition-all group">
                                    <div className="text-sm font-black text-white">{user.email}</div>
                                    <div className="flex justify-center">
                                        <span className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${user.role === 'admin' ? 'bg-[#5b7aff]/10 text-[#5b7aff]' : 'bg-white/[0.03] text-[#828a9f]'}`}>
                                            {user.role}
                                        </span>
                                    </div>
                                    <div className="text-center text-[12px] font-black text-[#828a9f]">
                                        {new Date(user.created_at).toLocaleDateString([], { month: 'short', day: '2-digit', year: 'numeric' })}
                                    </div>
                                    <div className="text-center font-mono text-sm font-black text-white">{user.total_checks.toLocaleString()}</div>
                                    <div className="flex justify-end">
                                        <span className="px-3 py-1 rounded-md bg-[#10b981]/10 text-[#10b981] text-[9px] font-black uppercase tracking-widest">
                                            Active
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button className="w-full py-4 mt-6 border-t border-white/[0.02] text-[11px] font-black text-[#5b7aff] uppercase tracking-widest hover:text-[#5b7aff]/80 transition-all">
                        View All Users
                    </button>
                </div>
            </main>
        </div>
    );
}
