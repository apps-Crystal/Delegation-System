// Task type definitions
// These shapes are what the API layer (lib/api.ts) returns,
// regardless of whether data comes from mock or Google Sheets.

export type TaskStatus =
  | "pending"
  | "follow-up"
  | "on-hold"
  | "completed"
  | "cancelled"
  | "week-shifted";
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  /** Internal — 1-indexed sheet row used for updates. Not displayed in UI. */
  _row?: number;
  doerId: string;
  doerName: string;
  doerPhone: string;
  description: string;
  plannedDate: string; // ISO date string (YYYY-MM-DD)
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: string; // ISO datetime string
  completedAt?: string;
  holdReason?: string;
  reviseNote?: string;
  /** Mandatory completion note captured when the task is marked Complete. */
  textValidation?: string;
  /** Drive URL(s) of optional photo proofs, joined by " | ". */
  photoValidation?: string;
}

export interface NewTaskInput {
  doerId: string;
  description: string;
  plannedDate: string;
  priority: TaskPriority;
}

export interface TaskUpdate {
  status?: TaskStatus;
  holdReason?: string;
  reviseNote?: string;
  plannedDate?: string;
  // Used when marking a task complete (#2). Text is required, photo optional.
  textValidation?: string;
  photoBase64?: string;
  photoFilename?: string;
  photoMime?: string;
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pending",
  "follow-up": "Follow Up",
  "on-hold": "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
  "week-shifted": "Week Shifted",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
