import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserBatches } from "@/lib/db";

export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const batches = getUserBatches(session.userId, 20);
    return NextResponse.json({ batches });
}
