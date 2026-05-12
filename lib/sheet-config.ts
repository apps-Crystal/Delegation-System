/**
 * Column header aliases & value normalizers.
 *
 * The Sheets adapter looks at row 1 of each tab and tries to match
 * each logical field against this list of aliases (case-insensitive,
 * whitespace-insensitive). This is what makes the integration tolerant
 * of small naming variations between sheets.
 */

import type { TaskStatus, TaskPriority } from "@/types/task";

export type FieldKey =
  | "id"
  | "doerName"
  | "doerPhone"
  | "description"
  | "plannedDate"
  | "priority"
  | "status"
  | "createdAt"
  | "completedAt"
  | "holdReason"
  | "reviseNote"
  | "textValidation"
  | "photoValidation"
  | "revision1"
  | "revision2"
  | "totalRevisions"
  | "recurrenceDays";

/**
 * Aliases for master sheet columns. Match is case+whitespace insensitive.
 * First match wins — order from most-specific to most-generic.
 */
export const MASTER_ALIASES: Record<FieldKey, string[]> = {
  id: ["id", "task id", "taskid", "sno", "s no", "s.no", "sr no", "serial no", "serial", "sr.no"],
  doerName: ["doer name", "doer", "name", "assigned to", "assignee", "person", "responsible person", "employee"],
  doerPhone: ["phone number", "phone", "mobile", "mobile number", "contact", "contact number", "number"],
  description: ["task description", "description", "task", "work", "task name", "details", "task details", "work description"],
  // "latest revision" first so it wins over an empty "Planned Date" column.
  // The UI's "Planned" column shows whatever this resolves to.
  plannedDate: ["latest revision", "latest revision date", "revised date", "revision date", "revision", "latest date", "current date", "final date", "planned date", "due date", "target date", "deadline", "expected date", "task date", "delivery date", "end date", "task planned date", "delegation date"],
  priority: ["priority", "importance", "urgency"],
  status: ["status", "task status", "current status", "state", "progress"],
  createdAt: ["first date", "original date", "initial date", "date 1", "created at", "created", "assigned date", "date assigned", "creation date", "given date", "start date", "assigned on"],
  completedAt: ["completed at", "completed", "completion date", "done date", "actual completion", "completed on", "closed on"],
  holdReason: ["hold reason", "reason for hold", "on hold reason", "hold remarks"],
  reviseNote: ["revise note", "revision note", "remarks", "notes", "comments", "follow up note", "remark"],
  // Free-text completion note captured when a task is marked complete.
  textValidation: ["text validation", "validation text", "completion note", "completion text", "validation note", "complete note"],
  // Drive URL(s) of photo proofs uploaded at completion. Multiple URLs
  // are joined with " | ".
  photoValidation: ["photo validation", "photo_validation", "photo proof", "completion photo", "proof photo", "photo url", "photo link"],
  // Revision-history tracking columns (#4). Filled by `updateTask` when
  // the user revises a task. After 2 revisions or a week-boundary cross,
  // the row is flagged "Week Shifted" and a fresh row is appended.
  revision1: ["revision 1", "revision1", "rev 1", "rev1", "first revision", "revision a"],
  revision2: ["revision 2", "revision2", "rev 2", "rev2", "second revision", "revision b"],
  totalRevisions: ["total revisions", "totalrevisions", "revisions", "revision count", "no of revisions", "num revisions", "rev count"],
  // Optional recurrence column on the master sheet. When >0, completing the
  // row auto-creates a fresh task N days later (same doer + description).
  recurrenceDays: [
    "recurrence days",
    "recurrencedays",
    "recurrence",
    "recurring days",
    "recur days",
    "recurring",
    "recur every",
    "repeat every",
    "repeat days",
  ],
};

/**
 * Aliases for doerlist sheet columns.
 */
export const DOERLIST_ALIASES = {
  name: ["name", "doer", "doer name", "employee", "person", "employee name", "full name"],
  phone: ["phone number", "phone", "mobile", "mobile number", "contact", "contact number", "number"],
  email: ["email", "email address", "mail", "e-mail", "email id", "mail id"],
  department: ["department", "dept"],
  role: ["role", "designation", "position", "title"],
  lastWeekCommitment: [
    "last week commitment",
    "lastweekcommitment",
    "last week commit",
    "last-week commitment",
    "previous week commitment",
    "lw commitment",
  ],
  thisWeekCommitment: [
    "this week commitment",
    "thisweekcommitment",
    "this week commit",
    "this-week commitment",
    "current week commitment",
    "tw commitment",
  ],
} as const;

/**
 * Find the column index for a logical field given the actual header row.
 * Returns -1 if not found.
 *
 * `excludeIndices` lets the caller block off columns already claimed by other
 * (more specific) fields, so a generic alias like "date" cannot snatch a
 * column that should belong to "created date" / "completed date".
 */
export function findColumn(
  headers: string[],
  aliases: readonly string[],
  excludeIndices: ReadonlySet<number> = new Set()
): number {
  const normalized = headers.map((h) => normalize(h));
  // 1. Exact match wins, even over an exclusion (a header that matches a
  //    field's exact alias is unambiguously that field).
  for (const alias of aliases) {
    const target = normalize(alias);
    if (!target) continue;
    const idx = normalized.findIndex((h) => h === target);
    if (idx !== -1) return idx;
  }
  // 2. Fuzzy fallback: contains-match. Skip excluded columns and require the
  //    overlap to be at least 4 chars to avoid spurious matches like "date"
  //    inside "createddate".
  for (const alias of aliases) {
    const target = normalize(alias);
    if (target.length < 4) continue;
    for (let i = 0; i < normalized.length; i++) {
      if (excludeIndices.has(i)) continue;
      const h = normalized[i];
      if (!h) continue;
      if (h === target || h.includes(target) || target.includes(h)) return i;
    }
  }
  return -1;
}

export function normalize(s: string): string {
  return (s ?? "").toString().toLowerCase().replace(/[\s_\-./]+/g, "").trim();
}

/* ---------- Value normalizers ---------- */

export function normalizeStatus(raw: unknown): TaskStatus {
  const v = normalize(String(raw ?? ""));
  if (!v) return "pending";
  // Week Shifted checked first — it's set by the revise+week-shift logic.
  if (["weekshifted", "shifted", "weekshift"].some((x) => v === x || v.includes(x))) {
    return "week-shifted";
  }
  // Cancelled checked first so "cancel" doesn't accidentally match "completed".
  if (["cancelled", "cancel", "canceled", "void", "rejected", "dropped"].some((x) => v === x || v.includes(x))) {
    return "cancelled";
  }
  if (["done", "complete", "completed", "closed", "finished", "completion", "ok", "yes"].some((x) => v.includes(x))) {
    return "completed";
  }
  if (["onhold", "hold", "paused", "stuck", "blocked", "waiting"].some((x) => v.includes(x))) {
    return "on-hold";
  }
  if (["followup", "inprogress", "ongoing", "started", "active", "wip", "progress", "review"].some((x) => v.includes(x))) {
    return "follow-up";
  }
  return "pending";
}

export function normalizePriority(raw: unknown): TaskPriority {
  const v = normalize(String(raw ?? ""));
  if (!v) return "medium";
  if (["high", "urgent", "critical", "h", "1", "p1"].some((x) => v === x || v.includes(x))) {
    return "high";
  }
  if (["low", "l", "3", "p3"].some((x) => v === x || v.includes(x))) {
    return "low";
  }
  return "medium";
}

/**
 * Parse a date string into ISO YYYY-MM-DD format.
 * Accepts:
 *   - ISO (2026-05-07)
 *   - DD/MM/YYYY, DD-MM-YYYY (preferred — Indian format)
 *   - MM/DD/YYYY (only used if DMY parse fails and value > 12 in second slot)
 *   - DD-MMM-YYYY (15-May-2026)
 *   - DD MMM YYYY (15 May 2026)
 *   - Excel serial number (number)
 * Returns "" on failure.
 */
export function parseDate(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";
  const s = String(raw).trim();
  if (!s) return "";

  // Excel serial
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = parseFloat(s);
    if (n > 25000 && n < 80000) {
      const ms = (n - 25569) * 86400 * 1000;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }

  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // Slash/dash separated numerics
  const numeric = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (numeric) {
    let [, a, b, y] = numeric;
    let yy = parseInt(y, 10);
    if (yy < 100) yy += 2000;
    let day = parseInt(a, 10);
    let mon = parseInt(b, 10);
    // If day > 12 we know it's DMY. If month > 12 it must be MDY. Default DMY (Indian format).
    if (mon > 12 && day <= 12) {
      [day, mon] = [mon, day];
    }
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) {
      const dt = new Date(Date.UTC(yy, mon - 1, day));
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
  }

  // Month-name formats — both day-first and month-first
  const monthMap: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  };
  // 15-May-2026 / 15 May 2026 / 15 May 26
  const dayFirst = s.match(/^(\d{1,2})[\s\-,]+([A-Za-z]+)[\s\-,]+(\d{2,4})/);
  if (dayFirst) {
    const [, d, mStr, y] = dayFirst;
    const m = monthMap[mStr.toLowerCase().slice(0, 4)] ?? monthMap[mStr.toLowerCase().slice(0, 3)];
    if (m) {
      let yy = parseInt(y, 10);
      if (yy < 100) yy += 2000;
      const dt = new Date(Date.UTC(yy, m - 1, parseInt(d, 10)));
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
  }
  // May 15, 2026 / May 15 2026
  const monthFirst = s.match(/^([A-Za-z]+)[\s\-,]+(\d{1,2})[\s\-,]+(\d{2,4})/);
  if (monthFirst) {
    const [, mStr, d, y] = monthFirst;
    const m = monthMap[mStr.toLowerCase().slice(0, 4)] ?? monthMap[mStr.toLowerCase().slice(0, 3)];
    if (m) {
      let yy = parseInt(y, 10);
      if (yy < 100) yy += 2000;
      const dt = new Date(Date.UTC(yy, m - 1, parseInt(d, 10)));
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
  }

  // Final fallback — JS native parser
  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) return fallback.toISOString().slice(0, 10);

  return "";
}

/* ---------- Encoding back to sheet-friendly values ---------- */

export const STATUS_TO_SHEET: Record<TaskStatus, string> = {
  pending: "Pending",
  "follow-up": "Follow Up",
  "on-hold": "On Hold",
  completed: "Completed",
  // The legacy app and most existing sheets use "Cancel" (no -led).
  // We still normalize "Cancelled" / "Canceled" on read for safety.
  cancelled: "Cancel",
  "week-shifted": "Week Shifted",
};

export const PRIORITY_TO_SHEET: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
