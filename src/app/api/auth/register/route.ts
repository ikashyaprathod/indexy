import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createUser, getUserByEmail } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
    try {
        const { name, email, password } = await request.json();

        if (!name || !email || !password) {
            return NextResponse.json({ error: "Name, email, and password are required." }, { status: 400 });
        }
        if (password.length < 8) {
            return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
        }

        const existing = getUserByEmail(email.toLowerCase());
        if (existing) {
            return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const user = createUser(email.toLowerCase(), passwordHash, name.trim());

        await setSessionCookie({ userId: user.id, email: user.email, name: user.name });

        return NextResponse.json({
            user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
        });
    } catch (err) {
        console.error("[Register]", err);
        return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
    }
}
