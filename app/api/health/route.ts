import { NextResponse } from "next/server";
import { getHealth } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const health = await getHealth();
    return NextResponse.json(health);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
