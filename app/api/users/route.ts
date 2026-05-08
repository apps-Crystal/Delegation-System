import { NextResponse } from "next/server";
import { readUsers, appendDoers, type NewDoerInput } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const users = await readUsers();
    return NextResponse.json(users);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { doers?: NewDoerInput[] };
    const doers = Array.isArray(body?.doers) ? body.doers : [];
    if (doers.length === 0) {
      return NextResponse.json(
        { error: "Provide at least one doer in `doers` array." },
        { status: 400 }
      );
    }
    if (doers.some((d) => !d?.name?.trim())) {
      return NextResponse.json(
        { error: "Every doer must have a name." },
        { status: 400 }
      );
    }
    const result = await appendDoers(doers);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
