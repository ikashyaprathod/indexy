import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUserByEmail } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
    try {
        let { email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
        }

        email = email.trim().toLowerCase();
        const user = getUserByEmail(email);
        if (!user) {
            return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
        }

        await setSessionCookie({ userId: user.id, email: user.email, name: user.name, role: user.role });

        return NextResponse.json({
            user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
        });
    } catch (err) {
        console.error("[Login]", err);
        return NextResponse.json({ error: "Login failed. Please try again." }, { status: 500 });
    }
}
