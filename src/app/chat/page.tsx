"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Bot, User, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface Message {
    role: "user" | "assistant";
    content: string;
}

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    async function handleSend() {
        const text = input.trim();
        if (!text || loading) return;

        const userMsg: Message = { role: "user", content: text };
        const updated = [...messages, userMsg];
        setMessages(updated);
        setInput("");
        setLoading(true);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: updated }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setMessages([...updated, { role: "assistant", content: data.reply }]);
        } catch (err) {
            setMessages([
                ...updated,
                { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "Something went wrong."}` },
            ]);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex flex-col h-screen font-sans" style={{ background: "#05070a", color: "#d1d5db" }}>
            {/* Header */}
            <header className="flex items-center gap-4 px-6 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                <Link href="/" className="p-2 rounded-lg text-[#4b5563] hover:text-white hover:bg-white/5 transition-all">
                    <ArrowLeft size={18} />
                </Link>
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: "rgba(91,122,255,0.1)", border: "1px solid rgba(91,122,255,0.2)" }}>
                        <Bot size={18} className="text-[#5b7aff]" />
                    </div>
                    <div>
                        <div className="text-sm font-black text-white tracking-tight">Indexy Chat</div>
                        <div className="text-[10px] font-black text-[#4b5563] uppercase tracking-widest">Powered by Claude</div>
                    </div>
                </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full gap-4 opacity-40">
                        <Bot size={48} />
                        <p className="text-sm font-black uppercase tracking-widest">Ask me anything</p>
                    </div>
                )}
                {messages.map((m, i) => (
                    <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                        {m.role === "assistant" && (
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-1"
                                style={{ background: "rgba(91,122,255,0.1)", border: "1px solid rgba(91,122,255,0.15)" }}>
                                <Bot size={14} className="text-[#5b7aff]" />
                            </div>
                        )}
                        <div className={`max-w-[70%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                            m.role === "user"
                                ? "bg-[#5b7aff] text-white rounded-br-md"
                                : "rounded-bl-md"
                        }`}
                            style={m.role === "assistant" ? { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" } : undefined}>
                            {m.content}
                        </div>
                        {m.role === "user" && (
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-1 bg-[#5b7aff]/20 border border-[#5b7aff]/30">
                                <User size={14} className="text-[#5b7aff]" />
                            </div>
                        )}
                    </div>
                ))}
                {loading && (
                    <div className="flex gap-3">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: "rgba(91,122,255,0.1)", border: "1px solid rgba(91,122,255,0.15)" }}>
                            <Bot size={14} className="text-[#5b7aff]" />
                        </div>
                        <div className="px-4 py-3 rounded-2xl rounded-bl-md"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <Loader2 size={16} className="animate-spin text-[#5b7aff]" />
                        </div>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-6 py-4 border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-3 rounded-2xl px-4 py-2"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                        placeholder="Type a message..."
                        className="flex-1 bg-transparent outline-none text-sm text-white placeholder-[#4b5563]"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || loading}
                        className="p-2 rounded-xl text-white transition-all disabled:opacity-30 hover:bg-[#5b7aff]/20"
                        style={{ background: input.trim() && !loading ? "linear-gradient(135deg, #5b7aff, #4558e8)" : undefined }}
                    >
                        <Send size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
