import { NextResponse } from "next/server";
import { readTasks, readUsers, appendTask } from "@/lib/sheets";
import { getCurrentUser } from "@/lib/session";
import type { TaskStatus, NewTaskInput } from "@/types/task";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_STATUSES: TaskStatus[] = ["pending", "follow-up", "on-hold", "completed", "cancelled", "week-shifted"];

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status");
    const query = url.searchParams.get("q")?.trim().toLowerCase() ?? "";

    let tasks = await readTasks();

    if (statusParam && VALID_STATUSES.includes(statusParam as TaskStatus)) {
      tasks = tasks.filter((t) => t.status === statusParam);
    }
    if (query) {
      tasks = tasks.filter(
        (t) =>
          t.doerName.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.doerPhone.includes(query) ||
          t.id.toLowerCase().includes(query)
      );
    }
    return NextResponse.json(tasks);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as NewTaskInput;
    if (!body.doerId || !body.description?.trim() || !body.plannedDate) {
      return NextResponse.json(
        { error: "Missing required fields: doerId, description, plannedDate" },
        { status: 400 }
      );
    }
    const users = await readUsers();
    const user = users.find((u) => u.id === body.doerId);
    if (!user) {
      return NextResponse.json({ error: "Selected doer not found" }, { status: 400 });
    }
    const admin = await getCurrentUser();
    const created = await appendTask(body, user, admin?.email ?? "");
    return NextResponse.json(created);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
