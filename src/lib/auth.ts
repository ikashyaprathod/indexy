import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET ?? "indexy_super_secret_dev_key_change_in_production"
);

const COOKIE_NAME = "indexy_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface JWTPayload {
    userId: number;
    email: string;
    name: string;
    role: string;
}

// ─── Sign a new JWT ───────────────────────────────────────────────────────────
export async function signToken(payload: JWTPayload): Promise<string> {
    return new SignJWT({ ...payload })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("30d")
        .sign(SECRET);
}

// ─── Verify a JWT string ──────────────────────────────────────────────────────
export async function verifyToken(token: string): Promise<JWTPayload | null> {
    try {
        const { payload } = await jwtVerify(token, SECRET);
        return payload as unknown as JWTPayload;
    } catch (err: any) {
        console.error("[Auth] Token verification failed:", err.message);
        return null;
    }
}

// ─── Set session cookie (call from API route) ─────────────────────────────────
export async function setSessionCookie(payload: JWTPayload): Promise<void> {
    const token = await signToken(payload);
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: COOKIE_MAX_AGE,
        path: "/",
    });
}

// ─── Clear session cookie ─────────────────────────────────────────────────────
export async function clearSessionCookie(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
}

// ─── Get current session from cookie (server-side) ───────────────────────────
export async function getSession(): Promise<JWTPayload | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyToken(token);
}

// ─── Get session from raw cookie string (for middleware) ─────────────────────
export async function getSessionFromCookieString(cookieStr: string | null): Promise<JWTPayload | null> {
    if (!cookieStr) return null;
    const match = cookieStr.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
    if (!match) return null;
    return verifyToken(decodeURIComponent(match[1]));
}
