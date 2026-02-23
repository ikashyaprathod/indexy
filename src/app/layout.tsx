import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Indexy — Instant Google Index Checker",
  description:
    "Stop guessing. Know exactly which pages are indexed in real-time with our high-speed, direct-from-source verification engine.",
  keywords: ["google index checker", "seo tool", "indexed pages", "site index"],
  openGraph: {
    title: "Indexy — Instant Google Index Checker",
    description: "Check if your pages are indexed by Google in real time.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
