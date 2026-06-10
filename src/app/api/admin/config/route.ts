import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSetting, updateSetting } from "@/lib/db";

export async function GET() {
    const session = await getSession();
    if (!session || session.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const [guest_mode_val, public_signup_val] = await Promise.all([
        getSetting("guest_mode", "true"),
        getSetting("public_signup", "true"),
    ]);
    return NextResponse.json({
        guest_mode: guest_mode_val === "true",
        public_signup: public_signup_val === "true",
    });
}

export async function POST(request: Request) {
    const session = await getSession();
    if (!session || session.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    try {
        const { guest_mode, public_signup } = await request.json();

        if (typeof guest_mode === "boolean") {
            await updateSetting("guest_mode", String(guest_mode));
        }
        if (typeof public_signup === "boolean") {
            await updateSetting("public_signup", String(public_signup));
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
}
