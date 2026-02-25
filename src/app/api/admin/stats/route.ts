import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getGlobalStats, getAdminRecentChecks } from "@/lib/db";

export async function GET() {
    const session = await getSession();
    if (!session || session.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const stats = getGlobalStats();
    const recentChecks = getAdminRecentChecks(10);

    return NextResponse.json({ stats, recentChecks });
}
