import { cn } from "@/lib/utils";
import type { TaskStatus, TaskPriority } from "@/types/task";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/types/task";

const statusStyles: Record<TaskStatus, string> = {
  pending: "bg-status-pending/10 text-status-pending border-status-pending/20",
  "follow-up": "bg-status-followup/10 text-status-followup border-status-followup/20",
  "on-hold": "bg-status-hold/10 text-status-hold border-status-hold/20",
  completed: "bg-status-complete/10 text-status-complete border-status-complete/20",
  cancelled: "bg-text-muted/10 text-text-muted border-text-muted/20",
  "week-shifted": "bg-status-revise/10 text-status-revise border-status-revise/20",
};

const priorityStyles: Record<TaskPriority, string> = {
  low: "bg-bg-elevated text-text-secondary border-border",
  medium: "bg-status-followup/10 text-status-followup border-status-followup/20",
  high: "bg-status-revise/10 text-status-revise border-status-revise/20",
};

export function StatusBadge({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-md border",
        statusStyles[status],
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-[11px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-md border",
        priorityStyles[priority],
        className
      )}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
