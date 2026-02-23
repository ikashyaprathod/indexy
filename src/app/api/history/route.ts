import { NextResponse } from "next/server";
import { getRecentScans } from "@/lib/db";

export async function GET() {
    try {
        const results = getRecentScans(20);
        return NextResponse.json({ results });
    } catch {
        return NextResponse.json({ results: [] });
    }
}
