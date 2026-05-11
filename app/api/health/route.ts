import { NextResponse } from "next/server";
import { getHealth } from "@/lib/sheets";

export const dynamic = "force-dynamic";

function maskId(id: string | undefined): string {
  if (!id) return "<unset>";
  if (id.length < 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)} (len ${id.length})`;
}

function summarizeAppsScriptUrl(raw: string | undefined): string {
  if (!raw) return "<unset>";
  try {
    const u = new URL(raw);
    // Show shape so we can spot Workspace-restricted URLs (those include
    // /a/macros/<domain>/) vs public ones (just /macros/s/...).
    const path = u.pathname;
    const isWorkspace = path.startsWith("/a/macros/");
    const m = path.match(/\/s\/([^/]+)\//);
    const depId = m ? `${m[1].slice(0, 6)}…${m[1].slice(-4)} (len ${m[1].length})` : "<no-id>";
    return `${u.origin}${isWorkspace ? path.replace(/\/s\/[^/]+/, "/s/<id>") : "/macros/s/<id>"}/exec  depId=${depId}  workspaceRestricted=${isWorkspace}`;
  } catch {
    return "<invalid-url>";
  }
}

export async function GET() {
  try {
    const health = await getHealth();
    const env = {
      GOOGLE_SHEET_ID: maskId(process.env.GOOGLE_SHEET_ID),
      MASTER_SHEET: process.env.MASTER_SHEET ?? "Master",
      DOERLIST_SHEET: process.env.DOERLIST_SHEET ?? "Doer List",
      hasApiKey: !!process.env.GOOGLE_API_KEY,
      APPS_SCRIPT_URL: summarizeAppsScriptUrl(process.env.APPS_SCRIPT_URL),
    };
    return NextResponse.json({ ...health, env });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
