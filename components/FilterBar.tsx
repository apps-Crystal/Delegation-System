"use client";

import { Filter } from "lucide-react";
import type { TaskPriority } from "@/types/task";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  priority: TaskPriority | "all";
  onPriorityChange: (p: TaskPriority | "all") => void;
  totalCount: number;
  visibleCount: number;
}

export function FilterBar({
  priority,
  onPriorityChange,
  totalCount,
  visibleCount,
}: FilterBarProps) {
  const options: { value: TaskPriority | "all"; label: string }[] = [
    { value: "all", label: "All" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="flex items-center gap-1.5 text-text-muted uppercase tracking-wider font-semibold">
        <Filter className="w-3.5 h-3.5" />
        Priority
      </span>
      <div className="flex bg-bg-surface border border-border rounded-md p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onPriorityChange(o.value)}
            className={cn(
              "px-2.5 py-1 rounded transition-colors font-medium",
              priority === o.value
                ? "bg-bg-elevated text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="ml-auto text-text-muted">
        Showing <span className="text-text-primary font-mono">{visibleCount}</span>{" "}
        of <span className="text-text-primary font-mono">{totalCount}</span>
      </div>
    </div>
  );
}
