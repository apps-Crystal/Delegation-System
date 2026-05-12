"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock, ListChecks, PauseCircle, CheckCircle2, PlusCircle, AlertTriangle, Settings } from "lucide-react";
import { Header } from "@/components/Header";
import { TaskTable } from "@/components/TaskTable";
import { Button } from "@/components/Button";
import { getTasks, getTaskCounts, markTaskComplete, holdTask, reviseTask, restoreTask, cancelTask, editTaskDescription, type CountKey } from "@/lib/api";
import type { Task, TaskStatus } from "@/types/task";
import { cn } from "@/lib/utils";

const statCards = [
  {
    key: "pending" as TaskStatus,
    label: "Pending",
    icon: Clock,
    color: "text-status-pending",
    bg: "from-status-pending/10",
    href: "/pending",
  },
  {
    key: "follow-up" as TaskStatus,
    label: "Follow Up",
    icon: ListChecks,
    color: "text-status-followup",
    bg: "from-status-followup/10",
    href: "/follow-up",
  },
  {
    key: "on-hold" as TaskStatus,
    label: "On Hold",
    icon: PauseCircle,
    color: "text-status-hold",
    bg: "from-status-hold/10",
    href: "/on-hold",
  },
  {
    key: "completed" as TaskStatus,
    label: "Completed",
    icon: CheckCircle2,
    color: "text-status-complete",
    bg: "from-status-complete/10",
    href: "/completed",
  },
];

export default function DashboardPage() {
  const [counts, setCounts] = useState<Record<CountKey, number>>({
    pending: 0,
    "follow-up": 0,
    "on-hold": 0,
    completed: 0,
    cancelled: 0,
    "week-shifted": 0,
    overdue: 0,
  });
  const [recent, setRecent] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setError(null);
      const [c, t] = await Promise.all([getTaskCounts(), getTasks()]);
      setCounts(c);
      setRecent(
        t.filter((x) => x.status === "pending" || x.status === "follow-up").slice(0, 5)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleAction = async (
    id: string,
    action: "complete" | "revise" | "hold" | "restore" | "cancel" | "edit",
    payload?: {
      note?: string;
      date?: string;
      textValidation?: string;
      photoBase64?: string;
      photoFilename?: string;
      photoMime?: string;
      description?: string;
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
      } else if (action === "edit") {
        const next = (payload?.description ?? "").trim();
        if (!next) return;
        await editTaskDescription(id, next);
      }
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Action failed. Check Setup & Health.");
      throw e;
    }
  };

  const total = counts.pending + counts["follow-up"] + counts["on-hold"] + counts.completed;
  const active = counts.pending + counts["follow-up"];

  return (
    <div className="animate-slide-up">
      <Header
        title="Dashboard"
        subtitle="Track everything you've delegated, monitor follow-ups, and keep work moving."
        actions={
          <Link href="/add-task">
            <Button>
              <PlusCircle className="w-4 h-4" />
              New Task
            </Button>
          </Link>
        }
      />

      {error && (
        <div className="mb-6 rounded-2xl border border-status-revise/30 bg-status-revise/10 p-5">
          <div className="flex items-start gap-3 text-status-revise">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-sm">Couldn't load data from Google Sheets</div>
              <div className="text-sm mt-1 font-mono opacity-90 break-all">{error}</div>
              <Link
                href="/setup"
                className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-status-revise hover:underline"
              >
                <Settings className="w-3.5 h-3.5" /> Open Setup &amp; Health to diagnose
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {statCards.map((s) => {
          const Icon = s.icon;
          const value = counts[s.key];
          return (
            <Link
              key={s.key}
              href={s.href}
              className="group relative rounded-lg border border-border-subtle bg-bg-surface p-4 hover:border-border transition-colors shadow-card"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="text-text-muted text-[10px] uppercase tracking-[0.14em] font-semibold">
                  {s.label}
                </div>
                <div
                  className={cn(
                    "w-8 h-8 rounded-md bg-bg-elevated border border-border-subtle flex items-center justify-center",
                    s.color
                  )}
                >
                  <Icon className="w-4 h-4" strokeWidth={2} />
                </div>
              </div>
              <div className="text-3xl font-semibold text-text-primary leading-none">
                {value}
              </div>
              <div className="text-text-muted text-[11px] mt-1.5">
                {total > 0
                  ? `${Math.round((value / total) * 100)}% of all tasks`
                  : "No tasks yet"}
                <ArrowUpRight className="inline w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Summary strip */}
      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-card">
        <div>
          <div className="text-text-muted text-[10px] uppercase tracking-[0.14em] font-semibold mb-1">
            Workload Snapshot
          </div>
          <div className="text-base font-semibold text-text-primary leading-tight">
            {active} active task{active === 1 ? "" : "s"} need attention
          </div>
          <p className="text-text-secondary text-[12px] mt-0.5">
            {counts["on-hold"]} on hold · {counts.completed} completed lifetime
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/pending">
            <Button variant="secondary" size="sm">View Pending</Button>
          </Link>
          <Link href="/follow-up">
            <Button size="sm">Open Follow Up</Button>
          </Link>
        </div>
      </div>

      {/* Recent active tasks */}
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Active tasks</h2>
          <p className="text-text-secondary text-[12px]">
            Most recent pending and follow-up items.
          </p>
        </div>
        <Link
          href="/pending"
          className="text-[12px] text-accent hover:text-accent-hover flex items-center gap-1"
        >
          View all <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <TaskTable
        tasks={recent}
        loading={loading}
        emptyMessage="No active tasks. Take a breather or assign something new."
        onAction={handleAction}
      />
    </div>
  );
}
