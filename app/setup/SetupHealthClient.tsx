"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Database,
  ExternalLink,
  Check,
} from "lucide-react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Button } from "@/components/Button";
import { getSheetsHealth, type SheetsHealth } from "@/lib/api";
import { cn } from "@/lib/utils";

const FRIENDLY_KEYS: Record<string, string> = {
  id: "ID",
  doerName: "Doer Name",
  doerPhone: "Phone",
  description: "Task Description",
  plannedDate: "Planned Date",
  priority: "Priority",
  status: "Status",
  createdAt: "Created Date",
  completedAt: "Completed Date",
  holdReason: "Hold Reason",
  reviseNote: "Notes / Remarks",
};

const REQUIRED_KEYS = new Set(["doerName", "description", "status"]);

export function SetupHealthClient() {
  const [health, setHealth] = useState<SheetsHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await getSheetsHealth();
      setHealth(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load health.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="animate-slide-up">
      <Header
        title="Setup & Health"
        subtitle="Verify the Google Sheet connection and inspect column mappings."
        actions={
          <Button variant="secondary" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {error && (
        <div className="mb-6 rounded-2xl border border-status-revise/30 bg-status-revise/10 p-5">
          <div className="flex items-start gap-3 text-status-revise">
            <XCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-sm">Health check failed</div>
              <div className="text-sm mt-1 font-mono">{error}</div>
            </div>
          </div>
        </div>
      )}

      {loading && !health && (
        <div className="rounded-2xl border border-border-subtle bg-bg-surface p-8 text-center text-text-secondary text-sm">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-3 text-text-muted" />
          Checking sheet connection...
        </div>
      )}

      {health && (
        <>
          {/* Top-level status */}
          <div className="grid sm:grid-cols-3 gap-3 mb-8">
            <StatusCard
              ok={health.configured}
              label="Configured"
              detail={health.configured ? "Env vars present" : "Missing env vars"}
            />
            <StatusCard
              ok={health.canRead}
              label="Reads"
              detail={
                health.canRead
                  ? `Connected to "${health.sheetTitle ?? "sheet"}"`
                  : "Cannot reach sheet"
              }
            />
            <StatusCard
              ok={health.canWrite}
              warn={!health.canWrite}
              label="Writes"
              detail={
                health.canWrite
                  ? "Apps Script connected"
                  : "Apps Script not deployed"
              }
            />
          </div>

          {/* Errors & warnings */}
          {(health.errors.length > 0 || health.warnings.length > 0) && (
            <div className="mb-8 space-y-2">
              {health.errors.map((err, i) => (
                <div
                  key={`e-${i}`}
                  className="flex items-start gap-3 p-3 rounded-lg bg-status-revise/10 border border-status-revise/20 text-sm text-status-revise"
                >
                  <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="flex-1">{err}</div>
                </div>
              ))}
              {health.warnings.map((w, i) => (
                <div
                  key={`w-${i}`}
                  className="flex items-start gap-3 p-3 rounded-lg bg-status-pending/10 border border-status-pending/20 text-sm text-status-pending"
                >
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="flex-1">{w}</div>
                </div>
              ))}
            </div>
          )}

          {/* Doerlist sheet */}
          <SheetSection
            title="doerlist"
            found={health.doerSheet.found}
            rowCount={health.doerSheet.rowCount}
            headers={health.rawHeaders.doerlist}
            cols={health.doerSheet.columns}
            keys={["name", "phone"]}
            requiredKeys={new Set(["name"])}
            keyLabels={{ name: "Name", phone: "Phone" }}
          />

          {/* Master sheet */}
          <SheetSection
            title="master"
            found={health.masterSheet.found}
            rowCount={health.masterSheet.rowCount}
            headers={health.rawHeaders.master}
            cols={health.masterSheet.columns}
            keys={[
              "id",
              "doerName",
              "doerPhone",
              "description",
              "plannedDate",
              "priority",
              "status",
              "createdAt",
              "completedAt",
              "holdReason",
              "reviseNote",
            ]}
            requiredKeys={REQUIRED_KEYS}
            keyLabels={FRIENDLY_KEYS}
          />

          {/* Apps Script setup */}
          {!health.canWrite && (
            <div className="mt-8 rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/5 to-transparent p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display text-2xl text-text-primary leading-tight">
                    Enable writes (60-second setup)
                  </h3>
                  <p className="text-sm text-text-secondary mt-1">
                    Reads work via the API key, but adding/updating tasks needs a tiny Apps Script. Here's the exact steps.
                  </p>
                </div>
              </div>

              <ol className="space-y-3 text-sm text-text-secondary list-decimal pl-5">
                <li>
                  Open your Sheet → <strong className="text-text-primary">Extensions → Apps Script</strong>.
                </li>
                <li>
                  Delete the placeholder code, then copy the contents of{" "}
                  <code className="text-accent font-mono text-xs bg-bg-base px-1.5 py-0.5 rounded">apps-script.gs</code>{" "}
                  (in this project's root) and paste it in.
                </li>
                <li>
                  Click <strong className="text-text-primary">Save</strong>, then <strong className="text-text-primary">Deploy → New deployment</strong>.
                </li>
                <li>
                  Settings: <strong className="text-text-primary">Type: Web app</strong> · Execute as: <strong className="text-text-primary">Me</strong> · Who has access: <strong className="text-text-primary">Anyone</strong>.
                </li>
                <li>
                  Click <strong className="text-text-primary">Deploy</strong>, authorize, then <strong className="text-text-primary">copy the Web App URL</strong>.
                </li>
                <li>
                  In <code className="text-accent font-mono text-xs bg-bg-base px-1.5 py-0.5 rounded">.env.local</code>, set{" "}
                  <code className="text-accent font-mono text-xs bg-bg-base px-1.5 py-0.5 rounded">APPS_SCRIPT_URL=...</code> and restart the dev server.
                </li>
              </ol>
            </div>
          )}

          {/* Quick links */}
          {health.canRead && health.errors.length === 0 && (
            <div className="mt-8 flex flex-wrap gap-2">
              <Link href="/">
                <Button>Go to dashboard</Button>
              </Link>
              <Link href="/add-task">
                <Button variant="secondary">Try adding a task</Button>
              </Link>
              <a
                href={`https://docs.google.com/spreadsheets/d/${process.env.NEXT_PUBLIC_SHEET_ID || ""}/edit`}
                target="_blank"
                rel="noreferrer"
              >
                <Button variant="ghost">
                  Open sheet <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatusCard({
  ok,
  warn,
  label,
  detail,
}: {
  ok: boolean;
  warn?: boolean;
  label: string;
  detail: string;
}) {
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  const color = ok
    ? "text-status-complete border-status-complete/20 bg-status-complete/5"
    : warn
    ? "text-status-pending border-status-pending/20 bg-status-pending/5"
    : "text-status-revise border-status-revise/20 bg-status-revise/5";
  return (
    <div className={cn("rounded-2xl border p-5", color)}>
      <div className="flex items-center gap-2.5 mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-[11px] uppercase tracking-[0.16em] font-semibold text-text-muted">
          {label}
        </span>
      </div>
      <div className="text-text-primary font-medium">{detail}</div>
    </div>
  );
}

function SheetSection({
  title,
  found,
  rowCount,
  headers,
  cols,
  keys,
  requiredKeys,
  keyLabels,
}: {
  title: string;
  found: boolean;
  rowCount: number;
  headers: string[];
  cols: Record<string, number>;
  keys: string[];
  requiredKeys: Set<string>;
  keyLabels: Record<string, string>;
}) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-surface p-6 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-2xl text-text-primary leading-tight">
            {title}
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            {found
              ? `${rowCount} row${rowCount === 1 ? "" : "s"} · ${headers.length} column${headers.length === 1 ? "" : "s"}`
              : "Sheet not found"}
          </p>
        </div>
        {found ? (
          <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-status-complete/10 text-status-complete border border-status-complete/20">
            Connected
          </span>
        ) : (
          <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-status-revise/10 text-status-revise border border-status-revise/20">
            Missing
          </span>
        )}
      </div>

      {found && (
        <>
          {/* Raw headers row */}
          <div className="mb-4">
            <div className="text-[10px] uppercase tracking-[0.16em] font-semibold text-text-muted mb-2">
              Headers detected (row 1)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {headers.map((h, i) => (
                <span
                  key={i}
                  className="text-xs font-mono px-2 py-1 rounded-md bg-bg-base border border-border-subtle text-text-secondary"
                >
                  {String.fromCharCode(65 + i)}: {h || "(empty)"}
                </span>
              ))}
            </div>
          </div>

          {/* Mapping table */}
          <div className="rounded-lg border border-border-subtle overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-elevated/50 text-text-muted text-[10px] uppercase tracking-[0.14em] font-semibold">
                <tr>
                  <th className="text-left px-3 py-2">Field</th>
                  <th className="text-left px-3 py-2">Mapped to</th>
                  <th className="text-left px-3 py-2 w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const idx = cols[k] ?? -1;
                  const required = requiredKeys.has(k);
                  return (
                    <tr key={k} className="border-t border-border-subtle">
                      <td className="px-3 py-2 text-text-primary">
                        {keyLabels[k] ?? k}
                        {required && (
                          <span className="ml-1.5 text-[10px] text-status-revise">required</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {idx === -1 ? (
                          <span className="text-text-muted">—</span>
                        ) : (
                          <span className="text-accent">
                            Col {String.fromCharCode(65 + idx)} · {headers[idx]}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {idx !== -1 ? (
                          <span className="inline-flex items-center gap-1 text-status-complete text-xs">
                            <Check className="w-3 h-3" /> Found
                          </span>
                        ) : required ? (
                          <span className="text-status-revise text-xs">Missing</span>
                        ) : (
                          <span className="text-text-muted text-xs">Optional</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
