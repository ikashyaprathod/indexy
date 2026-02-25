import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createUser, getUserByEmail } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
    try {
        let { name, email, password } = await request.json();

        if (!name || !email || !password) {
            return NextResponse.json({ error: "Name, email, and password are required." }, { status: 400 });
        }

        email = email.trim().toLowerCase();

        if (password.length < 8) {
            return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
        }

        try {
            const existing = getUserByEmail(email);
            if (existing) {
                return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
            }

            const passwordHash = await bcrypt.hash(password, 12);
            const user = createUser(email, passwordHash, name.trim());

            await setSessionCookie({ userId: user.id, email: user.email, name: user.name, role: user.role });

            return NextResponse.json({
                user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
            });
        } catch (dbErr: any) {
            console.error("[Register DB Error]", dbErr);
            if (dbErr.message?.includes("UNIQUE constraint failed")) {
                return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
            }
            if (dbErr.code === "SQLITE_READONLY" || dbErr.message?.includes("readonly")) {
                return NextResponse.json({
                    error: "Database is read-only. This is likely because you are on Netlify or an environment without persistent storage."
                }, { status: 500 });
            }
            throw dbErr; // Re-throw to be caught by the outer catch
        }
    } catch (err: any) {
        console.error("[Register]", err);
        return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
    }
}
