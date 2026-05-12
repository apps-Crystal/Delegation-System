import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { SetupHealthClient } from "./SetupHealthClient";

/**
 * Restricted-access wrapper around the Setup & Health diagnostic UI.
 * Only the email below is allowed to view the page. Anyone else gets
 * a friendly "Restricted" notice even if they type the URL directly.
 */
const ADMIN_EMAIL = "apps@crystalgroup.in";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const user = await getCurrentUser();
  const allowed = user?.email?.toLowerCase() === ADMIN_EMAIL;

  if (!allowed) {
    return (
      <div className="animate-slide-up max-w-xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>

        <div className="rounded-xl border border-border-subtle bg-bg-surface p-8 shadow-card">
          <div className="w-12 h-12 rounded-full bg-status-revise/10 text-status-revise inline-flex items-center justify-center mb-4">
            <Lock className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-semibold text-text-primary mb-1">
            Setup &amp; Health is restricted
          </h1>
          <p className="text-sm text-text-secondary leading-relaxed">
            This page is reserved for the system administrator. If you believe
            you should have access, contact{" "}
            <a
              href={`mailto:${ADMIN_EMAIL}`}
              className="text-accent hover:underline"
            >
              {ADMIN_EMAIL}
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  return <SetupHealthClient />;
}
