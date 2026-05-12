"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  User as UserIcon,
  ChevronDown,
  Check,
  Phone,
} from "lucide-react";
import { Header } from "@/components/Header";
import { TaskTable } from "@/components/TaskTable";
import { getUsers, getTasks } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { User } from "@/types/user";
import type { Task } from "@/types/task";

type TabKey = "pending" | "completed" | "all";

const TODAY = () => new Date().toISOString().slice(0, 10);
const DAYS_AGO = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Mon-Sun range for the calendar week immediately before today. */
function lastWeekRange(): { start: string; end: string } {
  const today = new Date();
  const dow = today.getDay(); // 0 Sun..6 Sat
  const daysSinceMon = (dow + 6) % 7;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - daysSinceMon);
  thisMonday.setHours(0, 0, 0, 0);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setDate(thisMonday.getDate() - 1);
  return {
    start: lastMonday.toISOString().slice(0, 10),
    end: lastSunday.toISOString().slice(0, 10),
  };
}

function pct(numer: number, denom: number): number {
  if (denom <= 0) return 0;
  return Math.round((numer / denom) * 100);
}

export default function PerformancePage() {
  const [users, setUsers] = useState<User[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [doerId, setDoerId] = useState("");
  const [doerOpen, setDoerOpen] = useState(false);
  const [fromDate, setFromDate] = useState(DAYS_AGO(7));
  const [toDate, setToDate] = useState(TODAY());
  const [tab, setTab] = useState<TabKey>("pending");

  // Commitment inputs are persisted in localStorage per doer so the user can
  // come back to the page and still see what they wrote.
  const [lastWeekCommitment, setLastWeekCommitment] = useState("");
  const [thisWeekCommitment, setThisWeekCommitment] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [u, t] = await Promise.all([getUsers(), getTasks()]);
        setUsers(u);
        setAllTasks(t);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!doerId) {
      setLastWeekCommitment("");
      setThisWeekCommitment("");
      return;
    }
    if (typeof window === "undefined") return;
    setLastWeekCommitment(localStorage.getItem(`commit:last:${doerId}`) ?? "");
    setThisWeekCommitment(localStorage.getItem(`commit:this:${doerId}`) ?? "");
  }, [doerId]);

  const saveCommitment = (which: "last" | "this", value: string) => {
    if (!doerId || typeof window === "undefined") return;
    localStorage.setItem(`commit:${which}:${doerId}`, value);
  };

  const selectedUser = users.find((u) => u.id === doerId);

  /** Tasks assigned to the selected doer (no date filter yet). */
  const doerAllTasks = useMemo(() => {
    if (!selectedUser) return [] as Task[];
    return allTasks.filter((t) => t.doerName === selectedUser.name);
  }, [allTasks, selectedUser]);

  /** Same tasks restricted to the chosen date range (by plannedDate). */
  const doerRangeTasks = useMemo(() => {
    return doerAllTasks.filter(
      (t) => t.plannedDate && t.plannedDate >= fromDate && t.plannedDate <= toDate,
    );
  }, [doerAllTasks, fromDate, toDate]);

  // ─── Stats (current range) ──────────────────────────────────────────────
  const planned = doerRangeTasks.length;
  const completedTasks = doerRangeTasks.filter((t) => t.status === "completed");
  const completed = completedTasks.length;
  const onTime = completedTasks.filter(
    (t) => t.completedAt && t.plannedDate && t.completedAt <= t.plannedDate,
  ).length;
  const notCompletedPct = pct(planned - completed, planned);
  const notOnTimePct = pct(planned - onTime, planned);
  const completedPct = pct(completed, planned);
  const onTimePct = pct(onTime, planned);

  // ─── Last week stats (fixed Mon-Sun) ───────────────────────────────────
  const lw = lastWeekRange();
  const lastWeekTasks = doerAllTasks.filter(
    (t) => t.plannedDate && t.plannedDate >= lw.start && t.plannedDate <= lw.end,
  );
  const lastWeekCompleted = lastWeekTasks.filter((t) => t.status === "completed").length;
  const lastWeekOnTime = lastWeekTasks.filter(
    (t) =>
      t.status === "completed" &&
      t.completedAt &&
      t.plannedDate &&
      t.completedAt <= t.plannedDate,
  ).length;
  const lastWeekCompletedPct = pct(lastWeekCompleted, lastWeekTasks.length);
  const lastWeekOnTimePct = pct(lastWeekOnTime, lastWeekTasks.length);

  // ─── Task lists for the bottom tab ──────────────────────────────────────
  const pendingList = doerRangeTasks.filter((t) => t.status === "pending");
  const completedList = completedTasks;
  const tabTasks =
    tab === "pending" ? pendingList : tab === "completed" ? completedList : doerRangeTasks;
  const tabCounts: Record<TabKey, number> = {
    pending: pendingList.length,
    completed: completedList.length,
    all: doerRangeTasks.length,
  };

  return (
    <div className="animate-slide-up">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to dashboard
      </Link>

      <Header
        icon={BarChart3}
        title="Performance Report"
        subtitle="Pick a doer and a date range to see what was planned, completed, on time, and what wasn't."
      />

      {/* Filters */}
      <div className="grid sm:grid-cols-[1fr_180px_180px] gap-3 mb-6">
        {/* Doer selector */}
        <div>
          <label className="block text-[10px] uppercase tracking-[0.14em] text-text-muted mb-1.5 font-semibold">
            Doer
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setDoerOpen((v) => !v)}
              disabled={loading}
              className={cn(
                "w-full h-10 px-3 rounded-md border border-border bg-bg-surface text-left flex items-center gap-3 transition-colors",
                "hover:border-border-strong",
                doerOpen && "border-accent ring-2 ring-accent/20",
              )}
            >
              <div className="w-7 h-7 rounded-full bg-bg-elevated border border-border flex items-center justify-center shrink-0">
                <UserIcon className="w-3.5 h-3.5 text-text-muted" />
              </div>
              <div className="flex-1 min-w-0">
                {selectedUser ? (
                  <>
                    <div className="text-[13px] text-text-primary font-medium truncate leading-tight">
                      {selectedUser.name}
                    </div>
                    <div className="text-[11px] text-text-muted flex items-center gap-1">
                      <Phone className="w-2.5 h-2.5" /> {selectedUser.phone || "—"}
                    </div>
                  </>
                ) : (
                  <span className="text-text-muted text-[13px]">
                    {loading ? "Loading doers…" : "Select a team member"}
                  </span>
                )}
              </div>
              <ChevronDown
                className={cn(
                  "w-4 h-4 text-text-muted transition-transform shrink-0",
                  doerOpen && "rotate-180",
                )}
              />
            </button>

            {doerOpen && (
              <div className="absolute z-20 mt-1.5 w-full max-h-72 overflow-y-auto rounded-md border border-border bg-bg-surface shadow-card animate-fade-in">
                {users.length === 0 ? (
                  <div className="px-4 py-6 text-[13px] text-text-muted text-center">
                    No doers available.
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
                        doerId === u.id && "bg-bg-elevated",
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
                        <div className="text-[11px] text-text-muted">{u.phone || "—"}</div>
                      </div>
                      {doerId === u.id && <Check className="w-3.5 h-3.5 text-accent" />}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-[0.14em] text-text-muted mb-1.5 font-semibold">
            From
          </label>
          <div className="relative">
            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              max={toDate}
              className="w-full h-10 pl-9 pr-2 rounded-md text-[13px] border border-border bg-bg-surface"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-[0.14em] text-text-muted mb-1.5 font-semibold">
            To
          </label>
          <div className="relative">
            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              min={fromDate}
              className="w-full h-10 pl-9 pr-2 rounded-md text-[13px] border border-border bg-bg-surface"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-status-revise/30 bg-status-revise/10 p-3 text-xs text-status-revise">
          {error}
        </div>
      )}

      {!selectedUser ? (
        <div className="rounded-lg border border-dashed border-border bg-bg-surface p-10 text-center">
          <BarChart3 className="w-8 h-8 text-text-muted mx-auto mb-2" />
          <p className="text-sm text-text-secondary">
            Select a doer above to see their performance.
          </p>
        </div>
      ) : (
        <>
          {/* Stats table */}
          <div className="rounded-lg border border-border-subtle bg-bg-surface shadow-card overflow-x-auto mb-6">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-bg-elevated text-text-muted text-[10px] uppercase tracking-[0.14em] font-semibold border-b border-border-subtle">
                  <th className="text-left px-4 py-2.5">Delegation Score</th>
                  <th className="text-center px-4 py-2.5">Last Week Actual (%)</th>
                  <th className="text-center px-4 py-2.5">Planned Task</th>
                  <th className="text-center px-4 py-2.5">Completed Task</th>
                  <th className="text-center px-4 py-2.5">% Not Completed</th>
                  <th className="text-left px-4 py-2.5">Last Week Commitment</th>
                  <th className="text-left px-4 py-2.5">This Week Commitment</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border-subtle">
                  <td className="px-4 py-3 text-text-primary text-[13px]">
                    All work should be done
                  </td>
                  <td className="px-4 py-3 text-center text-text-primary font-mono">
                    {lastWeekCompletedPct}%
                  </td>
                  <td className="px-4 py-3 text-center text-text-primary font-mono">{planned}</td>
                  <td className="px-4 py-3 text-center text-text-primary font-mono">{completed}</td>
                  <td className="px-4 py-3 text-center font-mono">
                    <span
                      className={cn(
                        notCompletedPct > 0
                          ? "text-status-revise"
                          : "text-status-complete",
                      )}
                    >
                      {notCompletedPct}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={lastWeekCommitment}
                      onChange={(e) => {
                        setLastWeekCommitment(e.target.value);
                        saveCommitment("last", e.target.value);
                      }}
                      placeholder="—"
                      className="w-full h-9 px-2 rounded-md border border-border bg-bg-surface text-[13px]"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={thisWeekCommitment}
                      onChange={(e) => {
                        setThisWeekCommitment(e.target.value);
                        saveCommitment("this", e.target.value);
                      }}
                      placeholder="What will you commit?"
                      className="w-full h-9 px-2 rounded-md border border-border bg-bg-surface text-[13px]"
                    />
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-text-primary text-[13px]">
                    All work should be done on time
                  </td>
                  <td className="px-4 py-3 text-center text-text-primary font-mono">
                    {lastWeekOnTimePct}%
                  </td>
                  <td className="px-4 py-3 text-center text-text-primary font-mono">{planned}</td>
                  <td className="px-4 py-3 text-center text-text-primary font-mono">{onTime}</td>
                  <td className="px-4 py-3 text-center font-mono">
                    <span
                      className={cn(
                        notOnTimePct > 0 ? "text-status-revise" : "text-status-complete",
                      )}
                    >
                      {notOnTimePct}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-text-muted">
                    — same as above —
                  </td>
                  <td className="px-4 py-3 text-[11px] text-text-muted">
                    — same as above —
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Top-line summary chips */}
          <div className="grid sm:grid-cols-4 gap-3 mb-6">
            <SummaryChip label="Planned" value={String(planned)} />
            <SummaryChip
              label="Completed"
              value={`${completed} (${completedPct}%)`}
              tone={completed === planned && planned > 0 ? "good" : undefined}
            />
            <SummaryChip
              label="On time"
              value={`${onTime} (${onTimePct}%)`}
              tone={onTime === planned && planned > 0 ? "good" : undefined}
            />
            <SummaryChip
              label="Not done"
              value={`${planned - completed} (${notCompletedPct}%)`}
              tone={notCompletedPct > 0 ? "bad" : undefined}
            />
          </div>

          {/* Tab bar for task lists */}
          <div className="flex items-center gap-2 mb-3">
            {(["pending", "completed", "all"] as TabKey[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "inline-flex items-center gap-2 h-8 px-3 rounded-md text-xs font-medium border transition-colors",
                  tab === t
                    ? "bg-accent text-white border-accent"
                    : "bg-bg-surface text-text-secondary border-border hover:border-border-strong",
                )}
              >
                <span className="capitalize">{t}</span>
                <span
                  className={cn(
                    "text-[10px] font-mono px-1.5 py-0.5 rounded",
                    tab === t ? "bg-white/20" : "bg-bg-elevated text-text-muted",
                  )}
                >
                  {tabCounts[t]}
                </span>
              </button>
            ))}
          </div>

          {tabTasks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-bg-surface py-10 text-center text-sm text-text-muted">
              No tasks in this view.
            </div>
          ) : (
            <TaskTable tasks={tabTasks} showActions={false} onAction={async () => {}} />
          )}
        </>
      )}
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        tone === "good"
          ? "border-status-complete/30 bg-status-complete/5"
          : tone === "bad"
            ? "border-status-revise/30 bg-status-revise/5"
            : "border-border-subtle bg-bg-surface",
      )}
    >
      <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-text-muted mb-1">
        {label}
      </div>
      <div
        className={cn(
          "text-xl font-semibold",
          tone === "good"
            ? "text-status-complete"
            : tone === "bad"
              ? "text-status-revise"
              : "text-text-primary",
        )}
      >
        {value}
      </div>
    </div>
  );
}
