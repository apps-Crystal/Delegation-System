"use client";

import { useEffect, useState } from "react";
import {
  User as UserIcon,
  Phone,
  Mail,
  AlertCircle,
  Check,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import type { NewDoerInput, AddDoersResult } from "@/lib/api";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

interface DoerFormProps {
  onSubmit: (inputs: NewDoerInput[]) => Promise<AddDoersResult>;
}

type DoerRow = {
  uid: string;
  name: string;
  phone: string;
  email: string;
};

let _rowCounter = 0;
const newRow = (): DoerRow => ({
  uid: `r${++_rowCounter}-${Date.now()}`,
  name: "",
  phone: "",
  email: "",
});

export function DoerForm({ onSubmit }: DoerFormProps) {
  const [rows, setRows] = useState<DoerRow[]>([newRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AddDoersResult | null>(null);

  useEffect(() => {
    if (result) {
      const t = setTimeout(() => setResult(null), 4000);
      return () => clearTimeout(t);
    }
  }, [result]);

  const updateRow = (uid: string, patch: Partial<DoerRow>) =>
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));

  const addRow = () => setRows((rs) => [...rs, newRow()]);

  const removeRow = (uid: string) =>
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((r) => r.uid !== uid)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleaned: NewDoerInput[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.name.trim()) {
        return setError(`Doer #${i + 1}: name is required.`);
      }
      // Light-touch email sanity check — empty is OK, but if filled it must look like one.
      if (r.email && !/^\S+@\S+\.\S+$/.test(r.email.trim())) {
        return setError(`Doer #${i + 1}: email "${r.email}" doesn't look valid.`);
      }
      cleaned.push({
        name: r.name.trim(),
        phone: r.phone.trim(),
        email: r.email.trim(),
      });
    }

    setSubmitting(true);
    try {
      const res = await onSubmit(cleaned);
      setResult(res);
      // Reset for next batch
      setRows([newRow()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add doers.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-[10px] uppercase tracking-[0.14em] text-text-muted font-semibold">
            Doers ({rows.length})
          </label>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] font-semibold text-white bg-accent hover:bg-accent-hover shadow-sm transition-colors"
            title="Add another doer"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} /> Add Doer
          </button>
        </div>

        <div className="space-y-3">
          {rows.map((row, idx) => (
            <RowEditor
              key={row.uid}
              row={row}
              index={idx}
              canRemove={rows.length > 1}
              onChange={(patch) => updateRow(row.uid, patch)}
              onRemove={() => removeRow(row.uid)}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-status-revise/10 border border-status-revise/20 text-status-revise text-[13px]">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-2">
          {result.added > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-status-complete/10 border border-status-complete/20 text-status-complete text-[13px] animate-fade-in">
              <Check className="w-4 h-4 mt-0.5 shrink-0" />
              Added {result.added} doer{result.added === 1 ? "" : "s"} to the Doer List.
            </div>
          )}
          {result.skipped > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-status-pending/10 border border-status-pending/20 text-status-pending text-[13px]">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold mb-0.5">
                  Skipped {result.skipped}{" "}
                  {result.skipped === 1 ? "row" : "rows"}
                </div>
                <ul className="list-disc pl-4 text-[12px] space-y-0.5">
                  {result.skippedDetails.slice(0, 5).map((s, i) => (
                    <li key={i}>
                      {s.name || `(empty row #${s.index + 1})`} — {s.reason}
                    </li>
                  ))}
                  {result.skippedDetails.length > 5 && (
                    <li>
                      …and {result.skippedDetails.length - 5} more
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between pt-3 border-t border-border-subtle">
        <p className="text-[11px] text-text-muted">
          Names that already exist in the Doer List are skipped (case-insensitive).
        </p>
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Adding…
            </>
          ) : (
            `Add ${rows.length === 1 ? "Doer" : `${rows.length} Doers`}`
          )}
        </Button>
      </div>
    </form>
  );
}

/* ---------- Single row ---------- */

function RowEditor({
  row,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  row: DoerRow;
  index: number;
  canRemove: boolean;
  onChange: (patch: Partial<DoerRow>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-border-subtle rounded-md bg-bg-surface p-3.5 relative">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] uppercase tracking-[0.14em] text-text-muted font-semibold">
          Doer #{index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center justify-center w-6 h-6 rounded text-text-muted hover:bg-status-revise/10 hover:text-status-revise transition-colors"
            title="Remove this doer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-3 gap-2.5">
        <Field
          icon={UserIcon}
          label="Name *"
          value={row.name}
          onChange={(v) => onChange({ name: v })}
          placeholder="Full name"
          required
        />
        <Field
          icon={Phone}
          label="Number"
          value={row.phone}
          onChange={(v) => onChange({ phone: v })}
          placeholder="98xxxxxxxx"
        />
        <Field
          icon={Mail}
          label="Email"
          value={row.email}
          onChange={(v) => onChange({ email: v })}
          placeholder="name@crystalgroup.in"
          type="email"
        />
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  small,
}: {
  icon?: React.ElementType;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  small?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-[0.12em] text-text-muted mb-1 font-semibold">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            className={cn(
              "absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none"
            )}
          />
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={cn(
            "w-full h-9 px-2.5 rounded-md text-[13px]",
            Icon ? "pl-9" : "pl-2.5",
            small && "text-[12px]"
          )}
        />
      </div>
    </div>
  );
}
