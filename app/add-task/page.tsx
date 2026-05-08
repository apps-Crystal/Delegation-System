"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Header } from "@/components/Header";
import { TaskForm } from "@/components/TaskForm";
import { addTask, getUsers } from "@/lib/api";
import type { User } from "@/types/user";
import type { NewTaskInput } from "@/types/task";

export default function AddTaskPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUsers()
      .then((u) => {
        setUsers(u);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSubmit = async (inputs: NewTaskInput[]) => {
    // Sequential — so each task gets the next DT-N id from Apps Script
    // without colliding with the previous one in the same submission.
    for (const input of inputs) {
      await addTask(input);
    }
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
        title="Add New Task"
        subtitle="Delegate one or more tasks to a team member. Click + Add Task to assign multiple at once."
      />

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <div className="rounded-lg border border-border-subtle bg-bg-surface p-5 lg:p-6 shadow-card">
          <TaskForm users={users} onSubmit={handleSubmit} loading={loading} />
        </div>

        {/* Side panel */}
        <aside className="space-y-3">
          <div className="rounded-lg border border-border-subtle bg-bg-surface p-4 shadow-card">
            <div className="w-8 h-8 rounded-md bg-accent/10 flex items-center justify-center text-accent mb-2.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-text-primary leading-tight mb-1">
              Write tasks people can act on.
            </h3>
            <p className="text-[12px] text-text-secondary leading-relaxed">
              The more specific the description, the fewer follow-ups you'll need
              later.
            </p>
          </div>

          <div className="rounded-lg border border-border-subtle bg-bg-surface p-4 shadow-card">
            <h4 className="text-[10px] uppercase tracking-[0.14em] text-text-muted font-semibold mb-2.5">
              Good description includes
            </h4>
            <ul className="space-y-1.5 text-[12px] text-text-secondary">
              {[
                "What needs to happen",
                "Who or what is involved",
                "The deliverable or outcome",
                "Any context or constraints",
              ].map((tip) => (
                <li key={tip} className="flex gap-2">
                  <span className="text-accent-gold mt-0.5">›</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-dashed border-border p-4">
            <h4 className="text-[10px] uppercase tracking-[0.14em] text-text-muted font-semibold mb-2">
              Where it goes
            </h4>
            <p className="text-[12px] text-text-secondary leading-relaxed">
              Appended as a new row in the{" "}
              <span className="text-text-primary font-mono text-[11px]">Master</span>{" "}
              sheet. Doer's name and phone come from{" "}
              <span className="text-text-primary font-mono text-[11px]">Doer List</span>{" "}
              automatically.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
