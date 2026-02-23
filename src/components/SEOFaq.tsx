"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ShieldCheck, Gauge, Lock } from "lucide-react";

interface FAQ {
    q: string;
    a: string;
}

const FAQS: FAQ[] = [
    {
        q: "Why isn't my page indexed?",
        a: "Google may not index pages due to low-quality content, duplicate content, or crawl budget limitations. Ensure your sitemap is submitted.",
    },
    {
        q: "How accurate is this tool?",
        a: "Indexy uses direct search operator verification to check if a URL is visible in Google's index in real-time.",
    }
];

const BADGES = [
    { icon: ShieldCheck, label: "100% Accurate Data" },
    { icon: Gauge, label: "0.4s Latency" },
    { icon: Lock, label: "SSL Secured" },
];

export default function SEOFaq() {
    const [open, setOpen] = useState<number | null>(0);

    return (
        <section className="w-full px-6 pb-8 pt-4">
            <h2 className="text-center text-[15px] font-bold text-white mb-6">SEO FAQ</h2>

            <div className="space-y-3">
                {FAQS.map((faq, i) => (
                    <div
                        key={i}
                        className="rounded-xl overflow-hidden transition-all bg-[#233535] border border-[#2a4545]"
                    >
                        <button
                            onClick={() => setOpen(open === i ? null : i)}
                            className="w-full flex items-center justify-between px-5 pt-4 pb-2 text-left"
                        >
                            <span className="text-[13px] font-bold text-[#f1f5f9]">
                                {faq.q}
                            </span>
                        </button>
                        {open === i && (
                            <div className="px-5 pb-5 pt-1 animate-fade-in-up">
                                <p className="text-[11px] leading-relaxed text-[#9ca3af] font-medium">
                                    {faq.a}
                                </p>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-6 mt-8">
                {BADGES.map(({ icon: Icon, label }, index) => (
                    <div key={label} className="flex items-center gap-6">
                        <div className="flex items-center gap-2 text-[#4b5563]">
                            <Icon size={14} className="opacity-80" />
                            <span className="text-[10px] font-bold tracking-wide">
                                {label}
                            </span>
                        </div>
                        {index < BADGES.length - 1 && (
                            <div className="h-4 w-px bg-white/5" />
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}
