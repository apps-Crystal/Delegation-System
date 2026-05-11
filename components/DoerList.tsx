"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Mail, Phone, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUsers, getTasks } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import type { User } from "@/types/user";
import type { Task, TaskStatus } from "@/types/task";

interface DoerWithTasks extends User {
  tasks: Task[];
  counts: Record<TaskStatus, number>;
}

const ACTIVE_STATUSES: TaskStatus[] = ["pending", "follow-up", "on-hold"];

function emptyCounts(): Record<TaskStatus, number> {
  return {
    pending: 0,
    "follow-up": 0,
    "on-hold": 0,
    completed: 0,
    cancelled: 0,
    "week-shifted": 0,
  };
}

export function DoerList() {
  const [doers, setDoers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [u, t] = await Promise.all([getUsers(), getTasks()]);
        setDoers(u);
        setTasks(t);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load doers.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const enriched = useMemo<DoerWithTasks[]>(() => {
    const byDoer = new Map<string, Task[]>();
    for (const t of tasks) {
      const key = t.doerId || t.doerName;
      if (!key) continue;
      const list = byDoer.get(key) ?? [];
      list.push(t);
      byDoer.set(key, list);
    }
    return doers.map((d) => {
      const ts = byDoer.get(d.id) ?? byDoer.get(d.name) ?? [];
      const counts = emptyCounts();
      for (const t of ts) counts[t.status] = (counts[t.status] ?? 0) + 1;
      return { ...d, tasks: ts, counts };
    });
  }, [doers, tasks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return enriched;
    return enriched.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.phone.includes(q) ||
        (d.email ?? "").toLowerCase().includes(q),
    );
  }, [enriched, query]);

  return (
    <div className="mt-8 rounded-lg border border-border-subtle bg-bg-surface shadow-card">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border-subtle">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-accent/10 flex items-center justify-center text-accent">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary leading-tight">
              All Doers
            </h2>
            <p className="text-[11px] text-text-muted">
              Click a doer to see their tasks.
            </p>
          </div>
        </div>
        <input
          type="text"
          placeholder="Search name, phone, email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 px-3 text-xs rounded-md bg-bg-elevated border border-border placeholder:text-text-muted focus:bg-bg-surface w-56"
        />
      </div>

      {loading && (
        <div className="px-5 py-8 text-center text-xs text-text-muted">
          Loading doers…
        </div>
      )}

      {error && (
        <div className="px-5 py-4 text-xs text-status-revise">{error}</div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="px-5 py-8 text-center text-xs text-text-muted">
          {doers.length === 0 ? "No doers yet." : "No matches."}
        </div>
      )}

      <ul className="divide-y divide-border-subtle">
        {filtered.map((d) => {
          const open = openId === d.id;
          const activeCount = ACTIVE_STATUSES.reduce(
            (a, s) => a + d.counts[s],
            0,
          );
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : d.id)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-bg-elevated transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-accent/10 text-accent inline-flex items-center justify-center text-xs font-semibold shrink-0">
                  {(d.name || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary truncate">
                    {d.name}
                  </div>
                  <div className="flex gap-3 text-[11px] text-text-muted">
                    {d.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {d.phone}
                      </span>
                    )}
                    {d.email && (
                      <span className="inline-flex items-center gap-1 truncate">
                        <Mail className="w-3 h-3" />
                        {d.email}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <CountChip label="Active" value={activeCount} accent />
                  <CountChip label="Done" value={d.counts.completed} />
                  <CountChip label="Total" value={d.tasks.length} />
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-text-muted transition-transform",
                      open && "rotate-180",
                    )}
                  />
                </div>
              </button>

              {open && (
                <div className="px-5 pb-4 bg-bg-elevated/40">
                  <DoerTaskBreakdown tasks={d.tasks} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CountChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <span
      className={cn(
        "hidden sm:inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border",
        accent
          ? "bg-accent/10 text-accent border-accent/20"
          : "bg-bg-elevated text-text-secondary border-border",
      )}
    >
      <span className="uppercase tracking-wider">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

function DoerTaskBreakdown({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-text-muted">
        No tasks assigned to this doer yet.
      </div>
    );
  }

  // Active first, then completed/other.
  const sorted = [...tasks].sort((a, b) => {
    const ai = ACTIVE_STATUSES.includes(a.status) ? 0 : 1;
    const bi = ACTIVE_STATUSES.includes(b.status) ? 0 : 1;
    if (ai !== bi) return ai - bi;
    return b.plannedDate.localeCompare(a.plannedDate);
  });

  return (
    <div className="pt-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted font-semibold mb-2">
        Tasks ({tasks.length})
      </div>
      <ul className="space-y-1.5">
        {sorted.map((t) => (
          <li
            key={t.id}
            className="flex items-start gap-3 px-3 py-2 rounded-md bg-bg-surface border border-border-subtle"
          >
            <StatusBadge status={t.status} className="shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-text-primary truncate">
                {t.description || "(no description)"}
              </div>
              <div className="text-[10px] text-text-muted">
                {t.id} · planned {t.plannedDate}
                {t.completedAt ? ` · done ${t.completedAt}` : ""}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
