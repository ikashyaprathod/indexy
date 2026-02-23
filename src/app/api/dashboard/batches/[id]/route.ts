import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBatchResults } from "@/lib/db";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const batchId = parseInt(id);
    if (isNaN(batchId)) {
        return NextResponse.json({ error: "Invalid Batch ID" }, { status: 400 });
    }

    const results = getBatchResults(batchId);
    return NextResponse.json({ results });
}
