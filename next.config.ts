import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native modules that must stay server-side — never bundled by webpack
  serverExternalPackages: [
    "better-sqlite3",
    "bcryptjs",
    "playwright",
    "playwright-extra",
    "puppeteer-extra-plugin-stealth",
  ],
};

export default nextConfig;
