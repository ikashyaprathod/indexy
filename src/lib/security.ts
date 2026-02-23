import { NextRequest } from "next/server";

// In production, this would be an environment variable
const SECURITY_SECRET = process.env.API_SECURITY_SECRET || "indexy_internal_secret_key_123";

/**
 * Validates that a request is coming from the legitimate frontend.
 * Checks for Origin, Referer, and a custom security token.
 */
export async function validateRequest(req: NextRequest) {
    const origin = req.headers.get("origin");
    const referer = req.headers.get("referer");
    const token = req.headers.get("x-indexy-token");

    // 1. Basic Origin/Referer check (prevents some CSRF and direct API hits)
    // On localhost, we might allow any, but in production we'd be stricter
    if (process.env.NODE_ENV === "production") {
        const allowedOrigin = process.env.ALLOWED_ORIGIN || "https://indexy.app";
        if (origin && !origin.startsWith(allowedOrigin)) {
            return { valid: false, error: "Unauthorized Origin" };
        }
    }

    // 2. Custom Token Validation
    // For this implementation, we use a simple hash of the secret + today's date
    // This rotates daily and requires the secret to generate
    if (!token || token !== generateToken()) {
        return { valid: false, error: "Invalid Security Token" };
    }

    return { valid: true };
}

/**
 * Generates a simple security token. 
 * This should be called by the client (via a server action or SSR) 
 * and passed in the X-Indexy-Token header.
 */
export function generateToken(): string {
    const today = new Date().toDateString();
    // Simple mock signature (in production use a proper crypto hash)
    return Buffer.from(`${SECURITY_SECRET}:${today}`).toString("base64");
}

/**
 * Helper to get the client IP, handling proxies (like Vercel)
 */
export function getClientIp(req: NextRequest): string {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
        return forwarded.split(",")[0].trim();
    }
    return "127.0.0.1";
}
