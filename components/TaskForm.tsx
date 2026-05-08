"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  User as UserIcon,
  Phone,
  Calendar,
  AlertCircle,
  Check,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import type { User } from "@/types/user";
import type { TaskPriority, NewTaskInput } from "@/types/task";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

interface TaskFormProps {
  users: User[];
  /**
   * Called once with the full list of tasks the user wants to assign in
   * a single submission. The page is responsible for sequencing the
   * individual creates against the backend.
   */
  onSubmit: (inputs: NewTaskInput[]) => Promise<void>;
  loading?: boolean;
}

type TaskRow = {
  // Stable client-side key for React
  uid: string;
  description: string;
  plannedDate: string;
  priority: TaskPriority;
};

let _rowCounter = 0;
const newRow = (date: string): TaskRow => ({
  uid: `r${++_rowCounter}-${Date.now()}`,
  description: "",
  plannedDate: date,
  priority: "medium",
});

export function TaskForm({ users, onSubmit, loading }: TaskFormProps) {
  const today = new Date().toISOString().slice(0, 10);

  const [doerId, setDoerId] = useState("");
  const [rows, setRows] = useState<TaskRow[]>([newRow(today)]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [doerOpen, setDoerOpen] = useState(false);

  const selectedUser = users.find((u) => u.id === doerId);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 2400);
      return () => clearTimeout(t);
    }
  }, [success]);

  const updateRow = (uid: string, patch: Partial<TaskRow>) =>
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));

  const addRow = () => setRows((rs) => [...rs, newRow(today)]);

  const removeRow = (uid: string) =>
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((r) => r.uid !== uid)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!doerId) return setError("Please select a doer.");
    const cleaned: NewTaskInput[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.description.trim()) {
        return setError(`Task #${i + 1}: description is required.`);
      }
      if (!r.plannedDate) {
        return setError(`Task #${i + 1}: planned date is required.`);
      }
      cleaned.push({
        doerId,
        description: r.description.trim(),
        plannedDate: r.plannedDate,
        priority: r.priority,
      });
    }

    setSubmitting(true);
    try {
      await onSubmit(cleaned);
      setSuccess(
        cleaned.length === 1
          ? "Task delegated successfully."
          : `${cleaned.length} tasks delegated successfully.`
      );
      // Reset form for next batch
      setDoerId("");
      setRows([newRow(today)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task(s).");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Doer selection */}
      <div>
        <label className="block text-[10px] uppercase tracking-[0.14em] text-text-muted mb-1.5 font-semibold">
          Doer / Assignee
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setDoerOpen((v) => !v)}
            disabled={loading}
            className={cn(
              "w-full h-10 px-3 rounded-md border border-border bg-bg-surface text-left flex items-center gap-3 transition-colors",
              "hover:border-border-strong",
              doerOpen && "border-accent ring-2 ring-accent/20"
            )}
          >
            <div className="w-7 h-7 rounded-full bg-bg-elevated border border-border flex items-center justify-center shrink-0">
              <UserIcon className="w-3.5 h-3.5 text-text-muted" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              {selectedUser ? (
                <>
                  <div className="text-[13px] text-text-primary font-medium truncate leading-tight">
                    {selectedUser.name}
                  </div>
                  <div className="text-[11px] text-text-muted flex items-center gap-1">
                    <Phone className="w-2.5 h-2.5" /> {selectedUser.phone}
                    {selectedUser.department && (
                      <span className="ml-1.5">· {selectedUser.department}</span>
                    )}
                  </div>
                </>
              ) : (
                <span className="text-text-muted text-[13px]">
                  {loading ? "Loading users..." : "Select a team member"}
                </span>
              )}
            </div>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-text-muted transition-transform shrink-0",
                doerOpen && "rotate-180"
              )}
            />
          </button>

          {doerOpen && (
            <div className="absolute z-20 mt-1.5 w-full max-h-72 overflow-y-auto rounded-md border border-border bg-bg-surface shadow-card animate-fade-in">
              {users.length === 0 ? (
                <div className="px-4 py-6 text-[13px] text-text-muted text-center">
                  No users available.
                </div>
              ) : (
                users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setDoerId(u.id);
                      setDoerOpen(false);
                    }}
                    className={cn(
                      "w-full px-3 py-2 flex items-center gap-2.5 text-left hover:bg-bg-elevated transition-colors",
                      doerId === u.id && "bg-bg-elevated"
                    )}
                  >
                    <div className="w-7 h-7 rounded-full bg-bg-elevated border border-border flex items-center justify-center text-text-secondary text-[10px] font-semibold">
                      {u.name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-text-primary font-medium truncate leading-tight">
                        {u.name}
                      </div>
                      <div className="text-[11px] text-text-muted">
                        {u.phone}
                        {u.department && ` · ${u.department}`}
                      </div>
                    </div>
                    {doerId === u.id && (
                      <Check className="w-3.5 h-3.5 text-accent" />
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tasks block — repeater */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-[10px] uppercase tracking-[0.14em] text-text-muted font-semibold">
            Tasks ({rows.length})
          </label>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] font-semibold text-white bg-accent hover:bg-accent-hover shadow-sm transition-colors"
            title="Add another task for this doer"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} /> Add Task
          </button>
        </div>

        <div className="space-y-3">
          {rows.map((row, idx) => (
            <RowEditor
              key={row.uid}
              row={row}
              index={idx}
              minDate={today}
              canRemove={rows.length > 1}
              onChange={(patch) => updateRow(row.uid, patch)}
              onRemove={() => removeRow(row.uid)}
            />
          ))}
        </div>
      </div>

      {/* Status messages */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-status-revise/10 border border-status-revise/20 text-status-revise text-[13px]">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-status-complete/10 border border-status-complete/20 text-status-complete text-[13px] animate-fade-in">
          <Check className="w-4 h-4 mt-0.5 shrink-0" />
          {success}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between pt-3 border-t border-border-subtle">
        <p className="text-[11px] text-text-muted">
          {rows.length === 1
            ? "Will be created with status "
            : `${rows.length} tasks will be created with status `}
          <span className="text-status-pending font-medium">Pending</span>.
        </p>
        <Button type="submit" disabled={submitting || loading}>
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Creating...
            </>
          ) : (
            `Submit ${rows.length === 1 ? "Task" : `${rows.length} Tasks`}`
          )}
        </Button>
      </div>
    </form>
  );
}

/* ---------- Row editor (description + date + priority + remove) ---------- */

function RowEditor({
  row,
  index,
  minDate,
  canRemove,
  onChange,
  onRemove,
}: {
  row: TaskRow;
  index: number;
  minDate: string;
  canRemove: boolean;
  onChange: (patch: Partial<TaskRow>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-border-subtle rounded-md bg-bg-surface p-3.5 relative">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] uppercase tracking-[0.14em] text-text-muted font-semibold">
          Task #{index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center justify-center w-6 h-6 rounded text-text-muted hover:bg-status-revise/10 hover:text-status-revise transition-colors"
            title="Remove this task"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Description */}
      <textarea
        value={row.description}
        onChange={(e) => onChange({ description: e.target.value })}
        rows={2}
        placeholder="Describe what needs to be done…"
        className="w-full px-3 py-2 rounded-md text-[13px] resize-none leading-relaxed"
      />

      {/* Date + priority */}
      <div className="grid sm:grid-cols-[180px_1fr] gap-2.5 mt-2.5">
        <div className="relative">
          <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
          <input
            type="date"
            value={row.plannedDate}
            onChange={(e) => onChange({ plannedDate: e.target.value })}
            min={minDate}
            className="w-full h-9 pl-9 pr-2 rounded-md text-[13px]"
          />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {(["low", "medium", "high"] as TaskPriority[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange({ priority: p })}
              className={cn(
                "h-9 rounded-md border text-[12px] capitalize font-medium transition-colors",
                row.priority === p
                  ? p === "high"
                    ? "border-status-revise bg-status-revise/10 text-status-revise"
                    : p === "medium"
                    ? "border-status-followup bg-status-followup/10 text-status-followup"
                    : "border-status-complete bg-status-complete/10 text-status-complete"
                  : "border-border bg-bg-surface text-text-secondary hover:border-border-strong"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
