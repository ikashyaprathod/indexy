"use client";

import { useState, useEffect } from "react";
import { Zap, LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthModal from "./AuthModal";

interface UserInfo {
    id: number;
    name: string;
    email: string;
    plan: string;
}

export default function Header() {
    const router = useRouter();
    const [user, setUser] = useState<UserInfo | null>(null);
    const [authModal, setAuthModal] = useState<"login" | "signup" | null>(null);
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        fetch("/api/auth/me")
            .then((r) => r.json())
            .then((d) => { setUser(d.user ?? null); setChecked(true); })
            .catch(() => setChecked(true));

        // Open modal if redirected with ?auth=login
        const params = new URLSearchParams(window.location.search);
        if (params.get("auth") === "login") setAuthModal("login");
    }, []);

    async function handleLogout() {
        await fetch("/api/auth/logout", { method: "POST" });
        setUser(null);
        router.push("/");
        router.refresh();
    }

    return (
        <>
            <header
                className="fixed top-0 left-0 right-0 z-50 flex justify-center"
                style={{ background: "rgba(10,11,20,0.8)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
                <div className="max-w-[1300px] w-full px-6 py-3 flex items-center justify-between">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-2">
                        <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center"
                            style={{ background: "linear-gradient(135deg, #2563eb, #0ea5e9)" }}
                        >
                            <Zap size={14} color="white" fill="white" />
                        </div>
                        <span className="font-bold text-white text-base tracking-tight">indexy</span>
                    </Link>

                    {/* Nav actions */}
                    {checked && (
                        <div className="flex items-center gap-2">
                            {user ? (
                                <>
                                    <Link
                                        href="/dashboard"
                                        className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium text-[#94a3b8] hover:text-white transition-colors"
                                        style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                                    >
                                        <LayoutDashboard size={14} />
                                        Dashboard
                                    </Link>
                                    <div className="flex items-center gap-2.5 pl-2">
                                        <div
                                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                                            style={{ background: "linear-gradient(135deg, #5b7aff, #4af0c4)" }}
                                        >
                                            {user.name.charAt(0).toUpperCase()}
                                        </div>
                                        <button
                                            onClick={handleLogout}
                                            className="p-1.5 rounded-lg text-[#828a9f] hover:text-red-400 transition-colors"
                                            title="Log out"
                                        >
                                            <LogOut size={14} />
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setAuthModal("login")}
                                        className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                        style={{ color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)" }}
                                    >
                                        Log In
                                    </button>
                                    <button
                                        onClick={() => setAuthModal("signup")}
                                        className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white btn-neon"
                                    >
                                        Sign Up
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </header>

            {authModal && (
                <AuthModal
                    initialTab={authModal}
                    onClose={() => setAuthModal(null)}
                />
            )}
        </>
    );
}
