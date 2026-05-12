"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PlusCircle, AlertTriangle, Settings } from "lucide-react";
import { Header } from "./Header";
import { TaskTable } from "./TaskTable";
import { SearchBar } from "./SearchBar";
import { FilterBar } from "./FilterBar";
import { Button } from "./Button";
import {
  getTasks,
  markTaskComplete,
  reviseTask,
  holdTask,
  restoreTask,
  cancelTask,
} from "@/lib/api";
import type { Task, TaskStatus, TaskPriority } from "@/types/task";

interface TaskListPageProps {
  /** Filter by status. Omit when using `dueToday`. */
  status?: TaskStatus;
  /** Show all active (non-completed) tasks whose plannedDate is today. */
  dueToday?: boolean;
  title: string;
  subtitle: string;
  emptyMessage: string;
  showActions?: boolean;
  /** Reverse the list so the newest rows (latest sheet rows) appear first. */
  reverse?: boolean;
  // Override allowed actions per page if needed
  allowedActions?: ("complete" | "revise" | "hold" | "restore" | "cancel")[];
}

export function TaskListPage({
  status,
  dueToday,
  title,
  subtitle,
  emptyMessage,
  showActions = true,
  reverse = false,
  allowedActions,
}: TaskListPageProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<TaskPriority | "all">("all");

  const refresh = async () => {
    try {
      setError(null);
      const all = dueToday ? await getTasks() : await getTasks(status);
      let next = all;
      if (dueToday) {
        const today = new Date().toISOString().slice(0, 10);
        next = all.filter(
          (t) => t.status === "pending" && t.plannedDate <= today,
        );
      }
      setTasks(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, dueToday]);

  const filtered = useMemo(() => {
    let out = tasks;
    if (priority !== "all") out = out.filter((t) => t.priority === priority);
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (t) =>
          t.doerName.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.doerPhone.includes(q) ||
          t.id.toLowerCase().includes(q)
      );
    }
    return reverse ? [...out].reverse() : out;
  }, [tasks, query, priority, reverse]);

  const handleAction = async (
    id: string,
    action: "complete" | "revise" | "hold" | "restore" | "cancel",
    payload?: {
      note?: string;
      date?: string;
      textValidation?: string;
      photoBase64?: string;
      photoFilename?: string;
      photoMime?: string;
    }
  ) => {
    try {
      if (action === "complete") {
        await markTaskComplete(id, {
          textValidation: payload?.textValidation ?? "",
          photoBase64: payload?.photoBase64,
          photoFilename: payload?.photoFilename,
          photoMime: payload?.photoMime,
        });
      } else if (action === "revise") {
        await reviseTask(id, payload?.date);
      } else if (action === "hold") {
        await holdTask(id, payload?.note ?? "");
      } else if (action === "restore") {
        await restoreTask(id);
      } else if (action === "cancel") {
        await cancelTask(id);
      }
      await refresh();
    } catch (e) {
      alert(
        e instanceof Error ? e.message : "Action failed. Check Setup & Health."
      );
      throw e;
    }
  };

  return (
    <div className="animate-slide-up">
      <Header
        title={title}
        subtitle={subtitle}
        actions={
          <Link href="/add-task">
            <Button>
              <PlusCircle className="w-4 h-4" />
              New Task
            </Button>
          </Link>
        }
      />

      <div className="space-y-4 mb-6">
        <div className="grid sm:grid-cols-[1fr_auto] gap-3">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search by name, task, phone or ID..."
          />
        </div>
        <FilterBar
          priority={priority}
          onPriorityChange={setPriority}
          totalCount={tasks.length}
          visibleCount={filtered.length}
        />
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-status-revise/30 bg-status-revise/10 p-5">
          <div className="flex items-start gap-3 text-status-revise">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-sm">Couldn't load tasks</div>
              <div className="text-sm mt-1 font-mono opacity-90">{error}</div>
              <Link
                href="/setup"
                className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-status-revise hover:underline"
              >
                <Settings className="w-3.5 h-3.5" /> Open Setup & Health
              </Link>
            </div>
          </div>
        </div>
      )}

      <TaskTable
        tasks={filtered}
        loading={loading}
        emptyMessage={emptyMessage}
        showActions={showActions}
        allowedActions={allowedActions}
        onAction={handleAction}
      />
    </div>
  );
}
