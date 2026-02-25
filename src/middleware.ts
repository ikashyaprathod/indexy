import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookieString } from "@/lib/auth";

// Routes that require authentication
const PROTECTED = ["/dashboard", "/admin"];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
    if (!isProtected) return NextResponse.next();

    const cookieHeader = request.headers.get("cookie");
    const session = await getSessionFromCookieString(cookieHeader);

    // If no session, redirect to login
    if (!session) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.searchParams.set("auth", "login");
        return NextResponse.redirect(url);
    }

    // Role-based protection for /admin
    if (pathname.startsWith("/admin") && session.role !== "admin") {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/dashboard/:path*", "/admin/:path*"],
};
