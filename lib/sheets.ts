/**
 * Google Sheets adapter — SERVER-SIDE ONLY.
 *
 * Reads:  Direct calls to Google Sheets API v4 using GOOGLE_API_KEY.
 * Writes: Forwarded to a deployed Apps Script Web App (APPS_SCRIPT_URL).
 *
 * This module must NEVER be imported by client components.
 * All UI access goes through /app/api/* route handlers.
 */

import "server-only";
import type { Task, NewTaskInput, TaskUpdate, TaskStatus } from "@/types/task";
import type { User } from "@/types/user";
import {
  MASTER_ALIASES,
  DOERLIST_ALIASES,
  findColumn,
  normalizeStatus,
  normalizePriority,
  parseDate,
  STATUS_TO_SHEET,
  PRIORITY_TO_SHEET,
} from "./sheet-config";

const SHEET_ID = process.env.GOOGLE_SHEET_ID || "";
const API_KEY = process.env.GOOGLE_API_KEY || "";
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "";
const DOERLIST = process.env.DOERLIST_SHEET || "Doer List";
const MASTER = process.env.MASTER_SHEET || "Master";

// A1 notation requires tab names with spaces (or other special chars) to be
// single-quoted. Internal single quotes are escaped by doubling.
function quoteTab(tab: string): string {
  if (/^[A-Za-z0-9_]+$/.test(tab)) return tab;
  return `'${tab.replace(/'/g, "''")}'`;
}

// Cache of (configured tab name) -> (actual tab name as it exists in the sheet).
// Lets us tolerate case mismatches like "doer list" vs "Doer List".
let _tabResolveCache: Record<string, string> | null = null;
async function resolveTab(configured: string): Promise<string> {
  if (!_tabResolveCache) {
    try {
      const meta = await fetchMeta();
      const map: Record<string, string> = {};
      for (const s of meta.sheets) {
        map[s.title.toLowerCase()] = s.title;
      }
      _tabResolveCache = map;
    } catch {
      _tabResolveCache = {};
    }
  }
  return _tabResolveCache[configured.toLowerCase()] ?? configured;
}

if (!SHEET_ID || !API_KEY) {
  // Don't throw at import time — let API routes return clean errors instead.
  console.warn("[sheets] GOOGLE_SHEET_ID or GOOGLE_API_KEY not set");
}

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

/* ---------- Low-level reads ---------- */

async function fetchRange(range: string): Promise<string[][]> {
  if (!SHEET_ID || !API_KEY) {
    throw new Error("Sheets not configured. Check GOOGLE_SHEET_ID and GOOGLE_API_KEY.");
  }
  // If the caller passed "TabName!A1:Z", quote the tab portion when needed.
  const bang = range.indexOf("!");
  const finalRange =
    bang > 0 ? `${quoteTab(range.slice(0, bang))}${range.slice(bang)}` : range;
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(finalRange)}` +
    `?key=${API_KEY}&valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { values?: string[][] };
  return json.values ?? [];
}

async function fetchMeta(): Promise<{ title: string; sheets: { title: string }[] }> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?key=${API_KEY}&fields=properties.title,sheets.properties.title`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets meta ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    properties?: { title?: string };
    sheets?: { properties?: { title?: string } }[];
  };
  return {
    title: json.properties?.title ?? "",
    sheets: (json.sheets ?? []).map((s) => ({ title: s.properties?.title ?? "" })),
  };
}

/* ---------- High-level reads ---------- */

export async function readUsers(): Promise<User[]> {
  const tab = await resolveTab(DOERLIST);
  const rows = await fetchRange(`${tab}!A1:Z`);
  if (rows.length === 0) return [];
  const headers = rows[0];
  const nameCol = findColumn(headers, DOERLIST_ALIASES.name as readonly string[]);
  const phoneCol = findColumn(headers, DOERLIST_ALIASES.phone as readonly string[]);
  const emailCol = findColumn(headers, DOERLIST_ALIASES.email as readonly string[]);
  const deptCol = findColumn(headers, DOERLIST_ALIASES.department as readonly string[]);
  const roleCol = findColumn(headers, DOERLIST_ALIASES.role as readonly string[]);

  if (nameCol === -1) {
    throw new Error(
      `Could not find a 'Name' column in '${DOERLIST}'. Add a column named "Name" or "Doer Name".`
    );
  }

  const users: User[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const name = (r[nameCol] ?? "").toString().trim();
    if (!name) continue;
    users.push({
      id: `u-${i + 1}`, // row-based stable id within the doerlist
      name,
      phone: phoneCol !== -1 ? (r[phoneCol] ?? "").toString().trim() : "",
      email: emailCol !== -1 ? (r[emailCol] ?? "").toString().trim() : "",
      department: deptCol !== -1 ? (r[deptCol] ?? "").toString().trim() : undefined,
      role: roleCol !== -1 ? (r[roleCol] ?? "").toString().trim() : undefined,
    });
  }
  return users;
}

export async function readTasks(): Promise<Task[]> {
  const tab = await resolveTab(MASTER);
  // Read the master rows AND the Doer List concurrently — the Doer List
  // becomes the source of truth for phone numbers, even when Master has no
  // phone column or has empty phones.
  const [rows, users] = await Promise.all([
    fetchRange(`${tab}!A1:Z`),
    readUsers().catch(() => [] as User[]),
  ]);
  if (rows.length === 0) return [];
  const headers = rows[0];

  // Resolve master columns in priority order so that more-specific fields
  // claim a column before a generic alias on a later field can fuzzy-match it.
  const cols: Record<string, number> = {};
  const claimed = new Set<number>();
  const order: (keyof typeof MASTER_ALIASES)[] = [
    "id",
    "doerName",
    "doerPhone",
    "description",
    "createdAt",
    "completedAt",
    "revision1",
    "revision2",
    "plannedDate",
    "totalRevisions",
    "priority",
    "status",
    "holdReason",
    "reviseNote",
    "textValidation",
    "photoValidation",
  ];
  for (const k of order) {
    const idx = findColumn(headers, MASTER_ALIASES[k], claimed);
    cols[k] = idx;
    if (idx !== -1) claimed.add(idx);
  }

  // name -> phone map for fallback lookups when Master has no phone for the row
  const phoneByName = new Map<string, string>();
  for (const u of users) {
    const key = u.name.toLowerCase().trim();
    if (key && u.phone) phoneByName.set(key, u.phone);
  }

  const tasks: Task[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => !c || !c.toString().trim())) continue;

    const description =
      cols.description !== -1 ? (r[cols.description] ?? "").toString().trim() : "";
    const doerName =
      cols.doerName !== -1 ? (r[cols.doerName] ?? "").toString().trim() : "";

    // Skip rows that have neither a doer nor a description — likely empty/spacer rows
    if (!description && !doerName) continue;

    const rowNumber = i + 1; // 1-indexed sheet row
    const idFromSheet =
      cols.id !== -1 ? (r[cols.id] ?? "").toString().trim() : "";

    const phoneFromMaster =
      cols.doerPhone !== -1 ? (r[cols.doerPhone] ?? "").toString().trim() : "";
    const phoneFromDoerList = phoneByName.get(doerName.toLowerCase().trim()) ?? "";
    const doerPhone = phoneFromMaster || phoneFromDoerList;

    // Effective planned date = Latest Revision (col G) if set, otherwise
    // First Date (col D). This way un-revised tasks still show a date.
    const rawLatest = cols.plannedDate !== -1 ? r[cols.plannedDate] : "";
    const rawFirst = cols.createdAt !== -1 ? r[cols.createdAt] : "";
    const plannedDate =
      parseDate(rawLatest) ||
      parseDate(rawFirst) ||
      (rawLatest ?? "").toString().trim() ||
      (rawFirst ?? "").toString().trim();

    tasks.push({
      id: idFromSheet || `row-${rowNumber}`,
      _row: rowNumber, // internal — used for updates
      doerId: "",
      doerName,
      doerPhone,
      description,
      plannedDate,
      priority: normalizePriority(cols.priority !== -1 ? r[cols.priority] : ""),
      status: normalizeStatus(cols.status !== -1 ? r[cols.status] : ""),
      createdAt:
        cols.createdAt !== -1
          ? parseDate(r[cols.createdAt]) || new Date().toISOString()
          : new Date().toISOString(),
      completedAt:
        cols.completedAt !== -1
          ? parseDate(r[cols.completedAt]) || undefined
          : undefined,
      holdReason:
        cols.holdReason !== -1 ? (r[cols.holdReason] ?? "").toString().trim() || undefined : undefined,
      reviseNote:
        cols.reviseNote !== -1 ? (r[cols.reviseNote] ?? "").toString().trim() || undefined : undefined,
      textValidation:
        cols.textValidation !== -1 ? (r[cols.textValidation] ?? "").toString().trim() || undefined : undefined,
      photoValidation:
        cols.photoValidation !== -1 ? (r[cols.photoValidation] ?? "").toString().trim() || undefined : undefined,
    });
  }

  // Newest first by creation date
  return tasks.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime() || 0;
    const tb = new Date(b.createdAt).getTime() || 0;
    return tb - ta;
  });
}

/* ---------- Writes (via Apps Script) ---------- */

async function callAppsScript<T>(action: string, payload: unknown): Promise<T> {
  if (!APPS_SCRIPT_URL) {
    throw new Error(
      "Writes are disabled — APPS_SCRIPT_URL is not set. Deploy the Apps Script (see apps-script.gs) and add the URL to .env.local."
    );
  }
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoid CORS preflight
    body: JSON.stringify({ action, payload }),
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Apps Script ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  if (json && typeof json === "object" && "error" in json) {
    throw new Error(`Apps Script error: ${(json as { error: string }).error}`);
  }
  return json as T;
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

/**
 * Append one or more doers to the Doer List via Apps Script.
 * Names that already exist (case-insensitive) are skipped, not duplicated.
 */
export async function appendDoers(doers: NewDoerInput[]): Promise<AddDoersResult> {
  return await callAppsScript<AddDoersResult>("addDoers", {
    doers: doers.map((d) => ({
      name: d.name?.trim() ?? "",
      phone: d.phone?.trim() ?? "",
      email: d.email?.trim() ?? "",
    })),
  });
}

/**
 * Resolve a doer id like "u-7" to its 1-indexed sheet row number.
 * Throws if the id shape is wrong.
 */
function doerIdToRow(id: string): number {
  const m = id.match(/^u-(\d+)$/);
  if (!m) throw new Error(`Invalid doer id "${id}" — expected "u-<row>".`);
  const row = parseInt(m[1], 10);
  if (row < 2) throw new Error(`Invalid doer row ${row} — must be >= 2.`);
  return row;
}

export interface DoerPatch {
  name?: string;
  phone?: string;
  email?: string;
}

export async function updateDoerRow(
  id: string,
  patch: DoerPatch,
): Promise<{ row: number; name: string; phone: string; email: string }> {
  const row = doerIdToRow(id);
  return await callAppsScript("updateDoer", {
    row,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone.trim() } : {}),
    ...(patch.email !== undefined ? { email: patch.email.trim() } : {}),
  });
}

export async function deleteDoerRow(id: string): Promise<{ deleted: boolean; row: number }> {
  const row = doerIdToRow(id);
  return await callAppsScript("deleteDoer", { row });
}

export async function appendTask(
  input: NewTaskInput,
  userLookup: User,
  adminEmail = "",
): Promise<Task> {
  const payload = {
    doerName: userLookup.name,
    doerPhone: userLookup.phone,
    // Apps Script uses doerEmail to send the new-task notification email.
    // If the doer has no email on file, the email step is skipped.
    doerEmail: userLookup.email ?? "",
    description: input.description,
    plannedDate: input.plannedDate, // -> "Latest Revision" col
    priority: PRIORITY_TO_SHEET[input.priority],
    status: "Pending",
    // For a brand-new task there has been no revision yet, so the
    // First Date column is also seeded with the user's planned date.
    createdAt: input.plannedDate,   // -> "First Date" col
    adminEmail,
  };
  return await callAppsScript<Task>("addTask", payload);
}

export async function patchTask(rowOrId: string, update: TaskUpdate): Promise<Task> {
  // Send a normalized update payload. Apps Script handles row lookup.
  const payload: Record<string, unknown> = {
    rowOrId,
  };
  if (update.status) payload.status = STATUS_TO_SHEET[update.status];
  if (update.holdReason !== undefined) payload.holdReason = update.holdReason ?? "";
  if (update.reviseNote !== undefined) payload.reviseNote = update.reviseNote ?? "";
  if (update.plannedDate !== undefined) payload.plannedDate = update.plannedDate;
  if (update.status === "completed") {
    payload.completedAt = new Date().toISOString().slice(0, 10);
  }
  // Completion validation (#2) — text mandatory, photo optional.
  if (update.textValidation !== undefined) {
    payload.textValidation = update.textValidation;
  }
  if (update.photoBase64 && update.photoFilename) {
    payload.photoBase64 = update.photoBase64;
    payload.photoFilename = update.photoFilename;
    payload.photoMime = update.photoMime || "image/jpeg";
  }
  return await callAppsScript<Task>("updateTask", payload);
}

/* ---------- Health check ---------- */

export async function getHealth(): Promise<SheetsHealth> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const result: SheetsHealth = {
    configured: !!SHEET_ID && !!API_KEY,
    canRead: false,
    canWrite: !!APPS_SCRIPT_URL,
    doerSheet: { found: false, rowCount: 0, columns: {} },
    masterSheet: { found: false, rowCount: 0, columns: {} },
    errors,
    warnings,
    rawHeaders: { doerlist: [], master: [] },
  };

  if (!SHEET_ID) errors.push("GOOGLE_SHEET_ID is not set in .env.local");
  if (!API_KEY) errors.push("GOOGLE_API_KEY is not set in .env.local");
  if (!APPS_SCRIPT_URL)
    warnings.push("APPS_SCRIPT_URL not set — writes (add/update tasks) will fail until the Apps Script is deployed.");

  if (!result.configured) return result;

  // 1. Metadata fetch — confirms sheet is reachable + lists tabs
  let doerTab = DOERLIST;
  let masterTab = MASTER;
  try {
    const meta = await fetchMeta();
    result.sheetTitle = meta.title;
    const tabNames = meta.sheets.map((s) => s.title);
    const ciFind = (want: string) =>
      tabNames.find((t) => t.toLowerCase() === want.toLowerCase());
    const doerMatch = ciFind(DOERLIST);
    const masterMatch = ciFind(MASTER);
    if (!doerMatch) {
      errors.push(`Tab "${DOERLIST}" not found. Available tabs: ${tabNames.join(", ")}`);
    } else {
      if (doerMatch !== DOERLIST) {
        warnings.push(`DOERLIST_SHEET is "${DOERLIST}" but the actual tab is "${doerMatch}" — using "${doerMatch}". Update .env.local for an exact match.`);
      }
      doerTab = doerMatch;
    }
    if (!masterMatch) {
      errors.push(`Tab "${MASTER}" not found. Available tabs: ${tabNames.join(", ")}`);
    } else {
      if (masterMatch !== MASTER) {
        warnings.push(`MASTER_SHEET is "${MASTER}" but the actual tab is "${masterMatch}" — using "${masterMatch}". Update .env.local for an exact match.`);
      }
      masterTab = masterMatch;
    }
    result.canRead = true;
  } catch (e) {
    errors.push(`Cannot reach the sheet — ${e instanceof Error ? e.message : String(e)}. Make sure the sheet's General access is set to "Anyone with the link → Viewer".`);
    return result;
  }

  // 2. Inspect doerlist
  try {
    const rows = await fetchRange(`${doerTab}!A1:Z`);
    if (rows.length === 0) {
      errors.push(`Sheet "${doerTab}" is empty.`);
    } else {
      const headers = rows[0];
      result.rawHeaders.doerlist = headers;
      result.doerSheet.found = true;
      result.doerSheet.rowCount = Math.max(rows.length - 1, 0);
      const nameCol = findColumn(headers, DOERLIST_ALIASES.name as readonly string[]);
      const phoneCol = findColumn(headers, DOERLIST_ALIASES.phone as readonly string[]);
      result.doerSheet.columns = { name: nameCol, phone: phoneCol };
      if (nameCol === -1) errors.push(`No "Name" column found in "${doerTab}".`);
      if (phoneCol === -1) warnings.push(`No "Phone" column found in "${doerTab}". Phone numbers will be empty.`);
    }
  } catch (e) {
    errors.push(`Read failed for "${doerTab}": ${e instanceof Error ? e.message : String(e)}`);
  }

  // 3. Inspect master
  try {
    const rows = await fetchRange(`${masterTab}!A1:Z`);
    if (rows.length === 0) {
      errors.push(`Sheet "${masterTab}" is empty.`);
    } else {
      const headers = rows[0];
      result.rawHeaders.master = headers;
      result.masterSheet.found = true;
      result.masterSheet.rowCount = Math.max(rows.length - 1, 0);
      const colMap: Record<string, number> = {};
      const claimed = new Set<number>();
      const order: (keyof typeof MASTER_ALIASES)[] = [
        "id",
        "doerName",
        "doerPhone",
        "description",
        "createdAt",
        "completedAt",
        "plannedDate",
        "priority",
        "status",
        "holdReason",
        "reviseNote",
      ];
      for (const k of order) {
        const idx = findColumn(headers, MASTER_ALIASES[k], claimed);
        colMap[k] = idx;
        if (idx !== -1) claimed.add(idx);
      }
      result.masterSheet.columns = colMap;

      const required = ["doerName", "description", "status"];
      required.forEach((k) => {
        if (colMap[k] === -1) errors.push(`No "${k}" column found in "${masterTab}".`);
      });
      if (colMap.plannedDate === -1) warnings.push(`No "Planned Date" column found — dates will be blank.`);
      if (colMap.priority === -1) warnings.push(`No "Priority" column — defaulting to "medium".`);
    }
  } catch (e) {
    errors.push(`Read failed for "${masterTab}": ${e instanceof Error ? e.message : String(e)}`);
  }

  return result;
}
