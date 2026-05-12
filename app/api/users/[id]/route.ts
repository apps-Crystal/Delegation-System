import { NextRequest, NextResponse } from "next/server";
import { updateDoerRow, deleteDoerRow, type DoerPatch } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = (await req.json().catch(() => ({}))) as DoerPatch;
    const patch: DoerPatch = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.phone === "string") patch.phone = body.phone;
    if (typeof body.email === "string") patch.email = body.email;
    if (typeof body.lastWeekCommitment === "string")
      patch.lastWeekCommitment = body.lastWeekCommitment;
    if (typeof body.thisWeekCommitment === "string")
      patch.thisWeekCommitment = body.thisWeekCommitment;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "Provide at least one field to update." },
        { status: 400 },
      );
    }
    if (patch.name !== undefined && !patch.name.trim()) {
      return NextResponse.json(
        { error: "Name cannot be empty." },
        { status: 400 },
      );
    }
    const updated = await updateDoerRow(params.id, patch);
    return NextResponse.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const result = await deleteDoerRow(params.id);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
