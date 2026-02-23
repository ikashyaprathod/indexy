import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookieString } from "@/lib/auth";

// Routes that require authentication
const PROTECTED = ["/dashboard"];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
    if (!isProtected) return NextResponse.next();

    const cookieHeader = request.headers.get("cookie");
    const session = await getSessionFromCookieString(cookieHeader);

    if (!session) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.searchParams.set("auth", "login");
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/dashboard/:path*"],
};
