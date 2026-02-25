import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAllUsers, updatePremiumStatus } from "@/lib/db";

export async function GET() {
    const session = await getSession();
    if (!session || session.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const users = getAllUsers();
    return NextResponse.json({ users });
}

export async function POST(request: Request) {
    const session = await getSession();
    if (!session || session.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    try {
        const { email, plan } = await request.json();
        if (email && plan) {
            updatePremiumStatus(email, plan === "premium");
            return NextResponse.json({ success: true });
        }
        return NextResponse.json({ error: "Email and plan are required" }, { status: 400 });
    } catch (err) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
}
