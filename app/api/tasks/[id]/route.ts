import { NextResponse } from "next/server";
import { patchTask } from "@/lib/sheets";
import type { TaskUpdate } from "@/types/task";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const update = (await req.json()) as TaskUpdate;
    const result = await patchTask(params.id, update);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
