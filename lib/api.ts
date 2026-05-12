/**
 * Client-side API service.
 *
 * The UI imports ONLY this module for data. Every call goes to a
 * Next.js API route (/api/*) which talks to Google Sheets server-side.
 * This keeps the API key off the browser and gives us a clean
 * place to add caching/auth later.
 */

import type { Task, NewTaskInput, TaskUpdate, TaskStatus } from "@/types/task";
import type { User } from "@/types/user";

async function jfetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Invalid JSON from ${typeof input === "string" ? input : "request"}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

/* ---------- USERS ---------- */

export async function getUsers(): Promise<User[]> {
  return jfetch<User[]>("/api/users");
}

export interface NewDoerInput {
  name: string;
  phone?: string;
  email?: string;
}

export interface AddDoersResult {
  added: number;
  skipped: number;
  skippedDetails: { index: number; name: string; reason: string }[];
}

export async function addDoers(doers: NewDoerInput[]): Promise<AddDoersResult> {
  return jfetch<AddDoersResult>("/api/users", {
    method: "POST",
    body: JSON.stringify({ doers }),
  });
}

export interface DoerPatch {
  name?: string;
  phone?: string;
  email?: string;
  lastWeekCommitment?: string;
  thisWeekCommitment?: string;
}

export async function updateDoer(
  id: string,
  patch: DoerPatch,
): Promise<{
  row: number;
  name: string;
  phone: string;
  email: string;
  lastWeekCommitment?: string;
  thisWeekCommitment?: string;
}> {
  return jfetch(`/api/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteDoer(id: string): Promise<{ deleted: boolean; row: number }> {
  return jfetch(`/api/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/* ---------- AI ---------- */

export interface AIInsight {
  label: string;
  text: string;
}

export async function expandTaskDescription(text: string): Promise<AIInsight[]> {
  const data = await jfetch<{ options: AIInsight[] }>("/api/ai/expand", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  return data.options ?? [];
}

/* ---------- TASKS ---------- */

export async function getTasks(status?: TaskStatus): Promise<Task[]> {
  const url = status ? `/api/tasks?status=${encodeURIComponent(status)}` : "/api/tasks";
  return jfetch<Task[]>(url);
}

export async function searchTasks(
  query: string,
  status?: TaskStatus
): Promise<Task[]> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status) params.set("status", status);
  const qs = params.toString();
  return jfetch<Task[]>(`/api/tasks${qs ? `?${qs}` : ""}`);
}

export async function addTask(input: NewTaskInput): Promise<Task> {
  return jfetch<Task>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateTask(id: string, update: TaskUpdate): Promise<Task> {
  return jfetch<Task>(`/api/tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}

export interface CompleteTaskOptions {
  textValidation: string;
  photoBase64?: string;
  photoFilename?: string;
  photoMime?: string;
}

export async function markTaskComplete(
  id: string,
  opts: CompleteTaskOptions
): Promise<Task> {
  return updateTask(id, {
    status: "completed",
    textValidation: opts.textValidation,
    photoBase64: opts.photoBase64,
    photoFilename: opts.photoFilename,
    photoMime: opts.photoMime,
  });
}

export async function reviseTask(
  id: string,
  newPlannedDate?: string
): Promise<Task> {
  // Revise only shifts the planned date forward; the task keeps its
  // current status (typically stays "pending").
  return updateTask(id, {
    plannedDate: newPlannedDate,
  });
}

export async function holdTask(id: string, reason: string): Promise<Task> {
  return updateTask(id, { status: "on-hold", holdReason: reason });
}

export async function restoreTask(id: string): Promise<Task> {
  return updateTask(id, { status: "pending", holdReason: "" });
}

export async function cancelTask(id: string): Promise<Task> {
  return updateTask(id, { status: "cancelled" });
}

export async function editTaskDescription(id: string, description: string): Promise<Task> {
  return updateTask(id, { description });
}

/* ---------- AGGREGATES ---------- */

export type CountKey = TaskStatus | "overdue";

export async function getTaskCounts(): Promise<Record<CountKey, number>> {
  const tasks = await getTasks();
  const today = new Date().toISOString().slice(0, 10);
  // "follow-up" and "overdue" are *views* rather than statuses.
  // Pending / on-hold / completed counts still come from the status field.
  return tasks.reduce(
    (acc, t) => {
      if (t.status === "pending") acc.pending++;
      else if (t.status === "on-hold") acc["on-hold"]++;
      else if (t.status === "completed") acc.completed++;
      else if (t.status === "cancelled") acc.cancelled++;
      else if (t.status === "week-shifted") acc["week-shifted"]++;
      // Inactive rows (completed / cancelled / week-shifted) excluded
      // from the "due today" and "overdue" tallies.
      const active =
        t.status !== "completed" &&
        t.status !== "cancelled" &&
        t.status !== "week-shifted";
      if (active && t.plannedDate === today) acc["follow-up"]++;
      if (active && t.plannedDate && t.plannedDate < today) acc.overdue++;
      return acc;
    },
    {
      pending: 0,
      "follow-up": 0,
      "on-hold": 0,
      completed: 0,
      cancelled: 0,
      "week-shifted": 0,
      overdue: 0,
    } as Record<CountKey, number>
  );
}

/* ---------- HEALTH ---------- */

export interface SheetsHealth {
  configured: boolean;
  canRead: boolean;
  canWrite: boolean;
  sheetTitle?: string;
  doerSheet: { found: boolean; rowCount: number; columns: Record<string, number> };
  masterSheet: { found: boolean; rowCount: number; columns: Record<string, number> };
  errors: string[];
  warnings: string[];
  rawHeaders: { doerlist: string[]; master: string[] };
}

export async function getSheetsHealth(): Promise<SheetsHealth> {
  return jfetch<SheetsHealth>("/api/health");
}
