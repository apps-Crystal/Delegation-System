"use client";

import { useState } from "react";
import {
  Check,
  RotateCcw,
  PauseCircle,
  PlayCircle,
  Phone,
  MoreHorizontal,
  Camera,
  X as XIcon,
  Ban,
  MessageSquare,
  FileText,
  Pencil,
} from "lucide-react";
import type { Task, TaskStatus } from "@/types/task";
import { StatusBadge, PriorityBadge } from "./StatusBadge";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { cn, formatDate, formatRelative, isOverdue } from "@/lib/utils";

type Action = "complete" | "revise" | "hold" | "restore" | "cancel" | "edit";

type ActionPayload = {
  note?: string;
  date?: string;
  textValidation?: string;
  photoBase64?: string;
  photoFilename?: string;
  photoMime?: string;
  /** Used by the "edit" action — the new task description. */
  description?: string;
};

/** Maximum size we allow before rejecting (server still has to receive it). */
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8 MB

/** Read a File as base64 (without the data:URL prefix). */
function readFileAsBase64(
  file: File
): Promise<{ base64: string; mime: string; filename: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const comma = dataUrl.indexOf(",");
      const head = dataUrl.slice(0, comma); // "data:image/jpeg;base64"
      const base64 = dataUrl.slice(comma + 1);
      const mime = head.replace(/^data:/, "").replace(/;.*$/, "") || file.type;
      resolve({ base64, mime, filename: file.name });
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Earliest date the user is allowed to pick when revising a task.
 * Must be strictly after the task's current planned date — and never in the past.
 */
function getReviseMinDate(currentPlanned: string): string {
  const todayIso = new Date().toISOString().slice(0, 10);
  if (!currentPlanned) return todayIso;
  const d = new Date(currentPlanned);
  if (isNaN(d.getTime())) return todayIso;
  d.setUTCDate(d.getUTCDate() + 1);
  const next = d.toISOString().slice(0, 10);
  return next > todayIso ? next : todayIso;
}

interface TaskTableProps {
  tasks: Task[];
  loading?: boolean;
  emptyMessage?: string;
  showActions?: boolean;
  // Actions to show — defaults vary by intent. If not passed, uses smart defaults per row status.
  allowedActions?: Action[];
  onAction: (taskId: string, action: Action, payload?: ActionPayload) => Promise<void>;
}

export function TaskTable({
  tasks,
  loading,
  emptyMessage = "No tasks to show.",
  showActions = true,
  allowedActions,
  onAction,
}: TaskTableProps) {
  const [activeModal, setActiveModal] = useState<{
    task: Task;
    action: Action;
  } | null>(null);
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  // Complete-only state
  const [completionText, setCompletionText] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Edit-only state — new description text the user types in the modal.
  const [editText, setEditText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const closeModal = () => {
    setActiveModal(null);
    setNote("");
    setDate("");
    setCompletionText("");
    setPhotoFile(null);
    setPhotoError(null);
    setEditText("");
  };

  const handleConfirm = async () => {
    if (!activeModal) return;
    setSubmitting(true);
    try {
      const payload: ActionPayload = { note, date };
      if (activeModal.action === "complete") {
        payload.textValidation = completionText.trim();
        if (photoFile) {
          const { base64, mime, filename } = await readFileAsBase64(photoFile);
          payload.photoBase64 = base64;
          payload.photoMime = mime;
          payload.photoFilename = filename;
        }
      } else if (activeModal.action === "edit") {
        payload.description = editText.trim();
      }
      await onAction(activeModal.task.id, activeModal.action, payload);
      closeModal();
    } catch (e) {
      console.error(e);
      alert(
        e instanceof Error ? e.message : "Action failed. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="border border-border-subtle rounded-2xl bg-bg-surface overflow-hidden">
        <div className="animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 border-b border-border-subtle last:border-0 px-6 flex items-center gap-4">
              <div className="h-3 w-32 bg-bg-elevated rounded" />
              <div className="h-3 flex-1 bg-bg-elevated rounded" />
              <div className="h-3 w-20 bg-bg-elevated rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-xl bg-bg-surface py-14 text-center">
        <p className="text-text-secondary text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block border border-border-subtle rounded-xl bg-bg-surface overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-elevated text-text-muted text-[10px] uppercase tracking-[0.14em] font-semibold border-b border-border-subtle">
                <th className="text-left px-4 py-2.5 font-semibold">Doer</th>
                <th className="text-left px-4 py-2.5 font-semibold">Task</th>
                <th className="text-left px-4 py-2.5 font-semibold w-32">Planned</th>
                <th className="text-left px-4 py-2.5 font-semibold w-28">Status</th>
                {showActions && <th className="text-right px-4 py-2.5 font-semibold w-44">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {tasks.map((task, idx) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isLast={idx === tasks.length - 1}
                  showActions={showActions}
                  allowedActions={allowedActions}
                  onAction={(action) => {
                    if (action === "restore") {
                      onAction(task.id, action);
                    } else {
                      setActiveModal({ task, action });
                      if (action === "revise") {
                        setDate(getReviseMinDate(task.plannedDate));
                      } else {
                        setDate(task.plannedDate);
                      }
                      if (action === "edit") {
                        setEditText(task.description ?? "");
                      }
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            showActions={showActions}
            allowedActions={allowedActions}
            onAction={(action) => {
              if (action === "restore") {
                onAction(task.id, action);
              } else {
                setActiveModal({ task, action });
                setDate(
                  action === "revise"
                    ? getReviseMinDate(task.plannedDate)
                    : task.plannedDate
                );
                if (action === "edit") {
                  setEditText(task.description ?? "");
                }
              }
            }}
          />
        ))}
      </div>

      {/* Action modal (complete / revise / hold) */}
      {activeModal && (
        <Modal
          open
          onClose={closeModal}
          title={
            activeModal.action === "complete"
              ? "Mark Task Complete"
              : activeModal.action === "revise"
              ? "Revise Task"
              : activeModal.action === "hold"
              ? "Put Task On Hold"
              : activeModal.action === "cancel"
              ? "Cancel Task"
              : activeModal.action === "edit"
              ? "Edit Task"
              : ""
          }
          description={
            activeModal.action === "complete"
              ? "Add a completion note (required) and an optional photo as proof."
              : activeModal.action === "revise"
              ? "Update the planned date for this task."
              : activeModal.action === "hold"
              ? "Optionally add a reason for putting this task on hold."
              : activeModal.action === "edit"
              ? "Update the task description. Saved to the sheet immediately."
              : "Cancelling will remove this task from active lists. This cannot be undone from the app."
          }
        >
          <div className="space-y-4">
            <div className="rounded-md border border-border-subtle bg-bg-elevated p-3 text-[13px]">
              <div className="text-text-muted text-[11px] uppercase tracking-wider mb-1">
                Task
              </div>
              <div className="text-text-primary line-clamp-2">
                {activeModal.task.description}
              </div>
              <div className="text-text-secondary text-xs mt-1 flex items-center gap-1.5">
                <span>Assigned to {activeModal.task.doerName}</span>
                {activeModal.task.doerPhone && (
                  <a
                    href={`tel:${activeModal.task.doerPhone.replace(/\s+/g, "")}`}
                    className="inline-flex items-center gap-1 text-accent hover:underline"
                    title={`Call ${activeModal.task.doerName}`}
                  >
                    <Phone className="w-3 h-3" />
                    {activeModal.task.doerPhone}
                  </a>
                )}
              </div>
            </div>

            {activeModal.action === "complete" && (
              <>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
                    Completion Note <span className="text-status-revise">*</span>
                  </label>
                  <textarea
                    value={completionText}
                    onChange={(e) => setCompletionText(e.target.value)}
                    rows={3}
                    placeholder="What was done? Any details to record…"
                    className="w-full px-3 py-2.5 rounded-lg text-sm resize-none"
                    autoFocus
                  />
                  <p className="mt-1 text-[11px] text-text-muted">
                    Required. Saved to the &quot;Text Validation&quot; column.
                  </p>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
                    Photo Proof <span className="text-text-muted">(optional)</span>
                  </label>
                  {!photoFile ? (
                    <label className="flex items-center justify-center gap-2 h-20 border border-dashed border-border rounded-lg cursor-pointer hover:bg-bg-elevated text-text-muted text-[13px] transition-colors">
                      <Camera className="w-4 h-4" />
                      Click to select a photo
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          setPhotoError(null);
                          const f = e.target.files?.[0];
                          if (!f) return;
                          if (f.size > MAX_PHOTO_BYTES) {
                            setPhotoError(
                              `File too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max 8 MB.`
                            );
                            return;
                          }
                          setPhotoFile(f);
                        }}
                      />
                    </label>
                  ) : (
                    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-elevated border border-border">
                      <Camera className="w-4 h-4 text-text-secondary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-text-primary truncate">
                          {photoFile.name}
                        </div>
                        <div className="text-[11px] text-text-muted">
                          {(photoFile.size / 1024).toFixed(0)} KB · {photoFile.type}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPhotoFile(null)}
                        className="text-text-muted hover:text-status-revise p-1 transition-colors"
                        title="Remove photo"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  {photoError && (
                    <p className="mt-1.5 text-[11px] text-status-revise">{photoError}</p>
                  )}
                  <p className="mt-1 text-[11px] text-text-muted">
                    Uploaded to Drive and linked in the &quot;Photo Validation&quot; column.
                  </p>
                </div>
              </>
            )}

            {activeModal.action === "revise" && (
              <div>
                <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
                  New Planned Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={getReviseMinDate(activeModal.task.plannedDate)}
                  className="w-full h-10 px-3 rounded-lg text-sm"
                />
                {activeModal.task.plannedDate && (
                  <p className="mt-1.5 text-[11px] text-text-muted">
                    Current planned date is{" "}
                    <span className="text-text-secondary font-mono">
                      {formatDate(activeModal.task.plannedDate)}
                    </span>
                    . Pick a date after this.
                  </p>
                )}
              </div>
            )}

            {activeModal.action === "hold" && (
              <div>
                <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
                  Hold Reason <span className="text-text-muted">(optional)</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Why is this task on hold? (leave blank if not needed)"
                  className="w-full px-3 py-2.5 rounded-lg text-sm resize-none"
                />
              </div>
            )}

            {activeModal.action === "edit" && (
              <div>
                <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
                  Task Description <span className="text-status-revise">*</span>
                </label>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={4}
                  placeholder="What needs to be done?"
                  className="w-full px-3 py-2.5 rounded-lg text-sm resize-none leading-relaxed"
                  autoFocus
                />
                <p className="mt-1 text-[11px] text-text-muted">
                  Writes back to the &quot;Task&quot; column in the Master sheet.
                </p>
              </div>
            )}

            {activeModal.action === "cancel" && (
              <div className="rounded-md border border-status-revise/30 bg-status-revise/5 p-3 text-[13px] text-status-revise flex items-start gap-2">
                <Ban className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold mb-0.5">Are you sure?</div>
                  <div className="text-text-secondary">
                    The task will be marked <span className="font-semibold">Cancelled</span> in the sheet and disappear from active views.
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={closeModal} disabled={submitting}>
                Cancel
              </Button>
              <Button
                variant={
                  activeModal.action === "cancel"
                    ? "danger"
                    : activeModal.action === "hold"
                    ? "secondary"
                    : "primary"
                }
                onClick={handleConfirm}
                disabled={
                  submitting ||
                  (activeModal.action === "complete" && !completionText.trim()) ||
                  (activeModal.action === "edit" &&
                    (!editText.trim() ||
                      editText.trim() === (activeModal.task.description ?? "").trim())) ||
                  (activeModal.action === "revise" &&
                    (!date ||
                      (!!activeModal.task.plannedDate &&
                        date <= activeModal.task.plannedDate)))
                }
              >
                {submitting
                  ? activeModal.action === "complete" && photoFile
                    ? "Uploading…"
                    : "Saving…"
                  : activeModal.action === "complete"
                  ? "Mark Complete"
                  : activeModal.action === "cancel"
                  ? "Yes, Cancel Task"
                  : activeModal.action === "edit"
                  ? "Save Changes"
                  : "Confirm"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------- Row (desktop) ---------- */

function TaskRow({
  task,
  isLast,
  showActions,
  allowedActions,
  onAction,
}: {
  task: Task;
  isLast: boolean;
  showActions: boolean;
  allowedActions?: Action[];
  onAction: (a: Action) => void;
}) {
  const overdue = task.status !== "completed" && isOverdue(task.plannedDate);
  return (
    <tr
      className={cn(
        "group hover:bg-bg-elevated transition-colors",
        !isLast && "border-b border-border-subtle"
      )}
    >
      <td className="px-4 py-3 align-top">
        <div className="text-text-primary font-medium text-[13px] leading-tight">
          {task.doerName}
        </div>
        {task.doerPhone ? (
          <a
            href={`tel:${task.doerPhone.replace(/\s+/g, "")}`}
            className="text-text-muted hover:text-accent text-xs mt-0.5 flex items-center gap-1 transition-colors"
            title={`Call ${task.doerName}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Phone className="w-3 h-3" strokeWidth={2} />
            {task.doerPhone}
          </a>
        ) : (
          <div className="text-text-muted text-xs mt-0.5 flex items-center gap-1 opacity-60">
            <Phone className="w-3 h-3" strokeWidth={2} />
            No phone
          </div>
        )}
      </td>
      <td className="px-4 py-3 max-w-md">
        <div className="text-text-primary text-[13px] leading-snug line-clamp-2">
          {task.description}
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <PriorityBadge priority={task.priority} />
          <span className="text-text-muted text-[11px] font-mono">{task.id}</span>
          {task.holdReason && (
            <span className="text-status-hold text-[11px] truncate max-w-[200px]">
              · {task.holdReason}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 align-top whitespace-nowrap">
        <div
          className={cn(
            "text-[13px]",
            overdue ? "text-status-revise" : "text-text-primary"
          )}
        >
          {formatDate(task.plannedDate)}
        </div>
        <div className="text-text-muted text-[11px] mt-0.5">
          {overdue ? "Overdue · " : ""}
          {formatRelative(task.plannedDate)}
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="inline-flex items-center gap-1.5">
          <StatusBadge status={task.status} />
          {task.textValidation && (
            <NotePeekButton
              kind={task.status === "on-hold" ? "hold" : "completion"}
              text={task.textValidation}
            />
          )}
        </div>
      </td>
      {showActions && (
        <td className="px-4 py-3 align-top">
          <RowActions
            task={task}
            allowedActions={allowedActions}
            onAction={onAction}
          />
        </td>
      )}
    </tr>
  );
}

/* ---------- Card (mobile) ---------- */

function TaskCard({
  task,
  showActions,
  allowedActions,
  onAction,
}: {
  task: Task;
  showActions: boolean;
  allowedActions?: Action[];
  onAction: (a: Action) => void;
}) {
  const overdue = task.status !== "completed" && isOverdue(task.plannedDate);
  return (
    <div className="border border-border-subtle rounded-lg bg-bg-surface p-3.5 shadow-card">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-text-primary font-medium leading-tight">
            {task.doerName}
          </div>
          {task.doerPhone ? (
            <a
              href={`tel:${task.doerPhone.replace(/\s+/g, "")}`}
              className="text-text-muted hover:text-accent text-xs mt-0.5 flex items-center gap-1 transition-colors"
              title={`Call ${task.doerName}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Phone className="w-3 h-3" strokeWidth={2} />
              {task.doerPhone}
            </a>
          ) : (
            <div className="text-text-muted text-xs mt-0.5 opacity-60">No phone</div>
          )}
        </div>
        <div className="inline-flex items-center gap-1.5 shrink-0">
          <StatusBadge status={task.status} />
          {task.textValidation && (
            <NotePeekButton
              kind={task.status === "on-hold" ? "hold" : "completion"}
              text={task.textValidation}
            />
          )}
        </div>
      </div>
      <p className="text-text-secondary text-sm leading-snug">
        {task.description}
      </p>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <PriorityBadge priority={task.priority} />
        <span
          className={cn(
            "text-xs",
            overdue ? "text-status-revise" : "text-text-muted"
          )}
        >
          {overdue ? "Overdue · " : ""}
          {formatDate(task.plannedDate)}
        </span>
      </div>
      {task.holdReason && (
        <div className="mt-2 text-xs text-status-hold">
          On hold: {task.holdReason}
        </div>
      )}
      {showActions && (
        <div className="mt-3 pt-3 border-t border-border-subtle flex justify-end">
          <RowActions
            task={task}
            allowedActions={allowedActions}
            onAction={onAction}
          />
        </div>
      )}
    </div>
  );
}

/* ---------- Row actions ---------- */

function RowActions({
  task,
  allowedActions,
  onAction,
}: {
  task: Task;
  allowedActions?: Action[];
  onAction: (a: Action) => void;
}) {
  // Smart defaults if not given. "edit" is appended last on every status so
  // it shows up as the rightmost action on every list page — Pending,
  // Follow Up, On Hold, Completed, Cancelled and Week Shifted alike.
  const defaults: Record<TaskStatus, Action[]> = {
    pending: ["complete", "revise", "hold", "cancel", "edit"],
    "follow-up": ["complete", "revise", "hold", "cancel", "edit"],
    "on-hold": ["restore", "complete", "cancel", "edit"],
    completed: ["edit"],
    cancelled: ["edit"],
    "week-shifted": ["edit"],
  };
  const actions = allowedActions ?? defaults[task.status];

  if (actions.length === 0) {
    return (
      <div className="text-right text-xs text-text-muted">
        Read-only
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {actions.includes("complete") && (
        <button
          onClick={() => onAction("complete")}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium bg-status-complete/10 text-status-complete border border-status-complete/20 hover:bg-status-complete/20 transition-colors"
          title="Mark as complete"
        >
          <Check className="w-3.5 h-3.5" />
          Complete
        </button>
      )}
      {actions.includes("revise") && (
        <button
          onClick={() => onAction("revise")}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium bg-bg-elevated text-text-secondary border border-border hover:bg-bg-hover hover:text-text-primary transition-colors"
          title="Revise task"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Revise
        </button>
      )}
      {actions.includes("hold") && (
        <button
          onClick={() => onAction("hold")}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium bg-bg-elevated text-text-secondary border border-border hover:bg-bg-hover hover:text-status-hold transition-colors"
          title="Put on hold"
        >
          <PauseCircle className="w-3.5 h-3.5" />
          Hold
        </button>
      )}
      {actions.includes("restore") && (
        <button
          onClick={() => onAction("restore")}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium bg-bg-elevated text-text-secondary border border-border hover:bg-bg-hover hover:text-text-primary transition-colors"
          title="Restore to pending"
        >
          <PlayCircle className="w-3.5 h-3.5" />
          Restore
        </button>
      )}
      {actions.includes("cancel") && (
        <button
          onClick={() => onAction("cancel")}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-bg-elevated text-text-muted border border-border hover:bg-status-revise/10 hover:text-status-revise hover:border-status-revise/30 transition-colors"
          title="Cancel task"
        >
          <Ban className="w-3.5 h-3.5" />
        </button>
      )}
      {actions.includes("edit") && (
        <button
          onClick={() => onAction("edit")}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium bg-bg-elevated text-text-secondary border border-border hover:bg-bg-hover hover:text-accent transition-colors"
          title="Edit task description"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
      )}
    </div>
  );
}

/* ---------- Note peek button (hold reason / completion note) ---------- */

function NotePeekButton({
  kind,
  text,
}: {
  kind: "hold" | "completion";
  text: string;
}) {
  const [open, setOpen] = useState(false);
  const config =
    kind === "hold"
      ? {
          label: "Hold reason",
          title: "See hold reason",
          Icon: MessageSquare,
          buttonClass: "bg-status-hold/10 text-status-hold border-status-hold/20 hover:bg-status-hold/20",
          labelClass: "text-status-hold",
        }
      : {
          label: "Completion note",
          title: "See completion note",
          Icon: FileText,
          buttonClass: "bg-status-complete/10 text-status-complete border-status-complete/20 hover:bg-status-complete/20",
          labelClass: "text-status-complete",
        };
  const Icon = config.Icon;
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        title={config.title}
        className={cn(
          "inline-flex items-center justify-center w-6 h-6 rounded-md border transition-colors",
          config.buttonClass,
        )}
      >
        <Icon className="w-3 h-3" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute top-full right-0 mt-1 z-30 min-w-[200px] max-w-[320px] rounded-md border border-border bg-bg-surface shadow-card px-3 py-2 text-[12px] text-text-primary leading-snug whitespace-normal"
        >
          <span
            className={cn(
              "block text-[10px] uppercase tracking-wider font-semibold mb-1",
              config.labelClass,
            )}
          >
            {config.label}
          </span>
          {text}
        </span>
      )}
    </span>
  );
}
