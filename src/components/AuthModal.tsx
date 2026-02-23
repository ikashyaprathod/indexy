"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Mail, Lock, User, Zap, Eye, EyeOff } from "lucide-react";

interface AuthModalProps {
    initialTab?: "login" | "signup";
    onClose: () => void;
}

export default function AuthModal({ initialTab = "login", onClose }: AuthModalProps) {
    const router = useRouter();
    const [tab, setTab] = useState<"login" | "signup">(initialTab);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setError(null);
        setName(""); setEmail(""); setPassword("");
    }, [tab]);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const endpoint = tab === "login" ? "/api/auth/login" : "/api/auth/register";
        const body = tab === "login" ? { email, password } : { name, email, password };

        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error ?? "Something went wrong.");
                return;
            }

            router.push("/dashboard");
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                className="relative w-full max-w-md rounded-2xl p-8"
                style={{
                    background: "linear-gradient(135deg, #131825 0%, #0f1420 100%)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    boxShadow: "0 0 60px rgba(91,122,255,0.12), 0 25px 50px rgba(0,0,0,0.5)",
                }}
            >
                {/* Close */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1.5 rounded-lg text-[#828a9f] hover:text-white transition-colors"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                >
                    <X size={16} />
                </button>

                {/* Logo */}
                <div className="flex items-center gap-2.5 mb-6">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg, #5b7aff, #4af0c4)" }}>
                        <Zap size={16} fill="white" className="text-white" />
                    </div>
                    <span className="font-bold text-white text-lg">Indexy</span>
                </div>

                {/* Heading */}
                <h2 className="text-2xl font-bold text-white mb-1">
                    {tab === "login" ? "Welcome back" : "Create your account"}
                </h2>
                <p className="text-sm text-[#828a9f] mb-6">
                    {tab === "login"
                        ? "Log in to get unlimited index checks."
                        : "Sign up free — unlimited URL checks for registered users."}
                </p>

                {/* Tabs */}
                <div className="flex rounded-lg p-1 mb-6" style={{ background: "rgba(255,255,255,0.05)" }}>
                    {(["login", "signup"] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className="flex-1 py-2 rounded-md text-sm font-semibold transition-all"
                            style={
                                tab === t
                                    ? { background: "#1e2844", color: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }
                                    : { color: "#828a9f" }
                            }
                        >
                            {t === "login" ? "Log In" : "Sign Up"}
                        </button>
                    ))}
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {tab === "signup" && (
                        <div className="relative">
                            <User size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#828a9f]" />
                            <input
                                type="text"
                                placeholder="Full name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                className="w-full pl-11 pr-4 py-3.5 rounded-xl text-sm text-white placeholder-[#4b5563] outline-none transition-all"
                                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
                            />
                        </div>
                    )}

                    <div className="relative">
                        <Mail size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#828a9f]" />
                        <input
                            type="email"
                            placeholder="Email address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full pl-11 pr-4 py-3.5 rounded-xl text-sm text-white placeholder-[#4b5563] outline-none transition-all"
                            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
                        />
                    </div>

                    <div className="relative">
                        <Lock size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#828a9f]" />
                        <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={8}
                            className="w-full pl-11 pr-11 py-3.5 rounded-xl text-sm text-white placeholder-[#4b5563] outline-none transition-all"
                            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#828a9f] hover:text-white transition-colors"
                        >
                            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                    </div>

                    {error && (
                        <div className="rounded-lg px-4 py-3 text-sm text-red-400"
                            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                        style={{ background: "linear-gradient(135deg, #5b7aff, #4558e8)" }}
                    >
                        {loading ? (
                            <span className="animate-pulse">
                                {tab === "login" ? "Logging in…" : "Creating account…"}
                            </span>
                        ) : (
                            <>
                                <Zap size={14} fill="white" />
                                {tab === "login" ? "Log In" : "Create Account"}
                            </>
                        )}
                    </button>
                </form>

                <p className="text-center text-xs text-[#4b5563] mt-5">
                    {tab === "login" ? (
                        <>Don&apos;t have an account?{" "}
                            <button onClick={() => setTab("signup")} className="text-[#5b7aff] hover:underline font-medium">Sign up free</button>
                        </>
                    ) : (
                        <>Already have an account?{" "}
                            <button onClick={() => setTab("login")} className="text-[#5b7aff] hover:underline font-medium">Log in</button>
                        </>
                    )}
                </p>
            </div>
        </div>
    );
}
