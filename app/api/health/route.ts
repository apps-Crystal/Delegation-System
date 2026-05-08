import { NextResponse } from "next/server";
import { getHealth } from "@/lib/sheets";

export const dynamic = "force-dynamic";

function maskId(id: string | undefined): string {
  if (!id) return "<unset>";
  if (id.length < 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)} (len ${id.length})`;
}

export async function GET() {
  try {
    const health = await getHealth();
    const env = {
      GOOGLE_SHEET_ID: maskId(process.env.GOOGLE_SHEET_ID),
      MASTER_SHEET: process.env.MASTER_SHEET ?? "Master",
      DOERLIST_SHEET: process.env.DOERLIST_SHEET ?? "Doer List",
      hasApiKey: !!process.env.GOOGLE_API_KEY,
      hasAppsScriptUrl: !!process.env.APPS_SCRIPT_URL,
    };
    return NextResponse.json({ ...health, env });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
