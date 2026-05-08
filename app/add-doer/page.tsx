"use client";

import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";
import { Header } from "@/components/Header";
import { DoerForm } from "@/components/DoerForm";
import { addDoers, type NewDoerInput } from "@/lib/api";

export default function AddDoerPage() {
  const handleSubmit = async (inputs: NewDoerInput[]) => {
    return await addDoers(inputs);
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
        icon={UserPlus}
        title="Add Doer"
        subtitle="Add one or more team members to the Doer List. Click + Add Doer to add multiple at once."
      />

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <div className="rounded-lg border border-border-subtle bg-bg-surface p-5 lg:p-6 shadow-card">
          <DoerForm onSubmit={handleSubmit} />
        </div>

        <aside className="space-y-3">
          <div className="rounded-lg border border-border-subtle bg-bg-surface p-4 shadow-card">
            <div className="w-8 h-8 rounded-md bg-accent/10 flex items-center justify-center text-accent mb-2.5">
              <UserPlus className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-text-primary leading-tight mb-1">
              Why fill in everything?
            </h3>
            <p className="text-[12px] text-text-secondary leading-relaxed">
              Doers without an email won&apos;t get task notifications or daily
              reminders. Phone shows up next to their name on every task list
              so callers can reach them in one tap.
            </p>
          </div>

          <div className="rounded-lg border border-border-subtle bg-bg-surface p-4 shadow-card">
            <h4 className="text-[10px] uppercase tracking-[0.14em] text-text-muted font-semibold mb-2.5">
              Three fields
            </h4>
            <ul className="space-y-1.5 text-[12px] text-text-secondary">
              <li className="flex gap-2">
                <span className="text-status-revise mt-0.5">*</span>
                <span>
                  <span className="text-text-primary font-medium">Name</span> —
                  required, must be unique
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent-gold mt-0.5">›</span>
                <span>
                  <span className="text-text-primary font-medium">Number</span> — optional, powers the &quot;tap to call&quot; link
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent-gold mt-0.5">›</span>
                <span>
                  <span className="text-text-primary font-medium">Email</span> — optional, needed for notifications
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-lg border border-dashed border-border p-4">
            <h4 className="text-[10px] uppercase tracking-[0.14em] text-text-muted font-semibold mb-2">
              Where it goes
            </h4>
            <p className="text-[12px] text-text-secondary leading-relaxed">
              New rows are appended to the{" "}
              <span className="text-text-primary font-mono text-[11px]">Doer List</span>{" "}
              tab. Names that already exist are silently skipped (no
              duplicates).
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
