"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Search as SearchIcon } from "lucide-react";
import { Header } from "@/components/Header";
import { TaskTable } from "@/components/TaskTable";
import { getTasks } from "@/lib/api";
import type { Task } from "@/types/task";

export default function SearchPage() {
  const params = useSearchParams();
  const q = (params?.get("q") ?? "").trim();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getTasks()
      .then((t) => {
        setTasks(t);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load."))
      .finally(() => setLoading(false));
  }, []);

  const matches = useMemo(() => {
    if (!q) return [];
    const needle = q.toLowerCase();
    return tasks.filter(
      (t) =>
        t.id.toLowerCase().includes(needle) ||
        t.doerName.toLowerCase().includes(needle) ||
        (t.doerPhone ?? "").includes(needle) ||
        t.description.toLowerCase().includes(needle) ||
        (t.holdReason ?? "").toLowerCase().includes(needle) ||
        (t.reviseNote ?? "").toLowerCase().includes(needle),
    );
  }, [tasks, q]);

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
        icon={SearchIcon}
        title={q ? `Search: "${q}"` : "Search"}
        subtitle={
          q
            ? `${matches.length} match${matches.length === 1 ? "" : "es"} across every task.`
            : "Type in the search bar at the top and press Enter."
        }
      />

      {loading && (
        <div className="px-5 py-8 text-center text-xs text-text-muted">
          Loading…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-status-revise/30 bg-status-revise/5 p-4 text-xs text-status-revise">
          {error}
        </div>
      )}

      {!loading && !error && q && matches.length === 0 && (
        <div className="rounded-lg border border-border-subtle bg-bg-surface p-8 text-center text-sm text-text-muted">
          No tasks match <span className="font-mono">&quot;{q}&quot;</span>.
        </div>
      )}

      {!loading && !error && matches.length > 0 && (
        <TaskTable
          tasks={matches}
          showActions={false}
          onAction={async () => {}}
        />
      )}
    </div>
  );
}
