"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, RefreshCw, ChevronDown, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface TopBarProps {
  site?: string;
  online?: boolean;
  user?: { name: string; email: string; role: string } | null;
}

/**
 * App-wide top bar — site label, online indicator, command-K search,
 * refresh, notifications, and the user chip on the right.
 *
 * Search and notifications are visual-only for now; refresh just reloads
 * the current route. Wire-up can come later.
 */
export function TopBar({ site = "Kolkata", online = true, user = null }: TopBarProps) {
  const [now, setNow] = useState<string>("");
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params?.get("q") ?? "");

  // Tiny clock just to make the chip feel alive — no extra requests
  useEffect(() => {
    const t = setInterval(() => {
      setNow(
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Keep input in sync when navigating between pages
  useEffect(() => {
    setQ(params?.get("q") ?? "");
  }, [params]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <header className="sticky top-0 z-30 h-14 bg-bg-surface border-b border-border-subtle flex items-center px-4 lg:px-6 gap-3">
      {/* Site + online */}
      <div className="hidden sm:flex items-center gap-2">
        <span className="px-2.5 h-7 inline-flex items-center text-xs font-semibold text-text-primary bg-bg-elevated border border-border rounded-md">
          {site}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-status-complete">
          <span className="w-1.5 h-1.5 rounded-full bg-status-complete animate-pulse" />
          System Online
        </span>
      </div>

      {/* Search */}
      <form onSubmit={submitSearch} className="flex-1 max-w-xl mx-auto">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks, doers... (press Enter)"
            className="w-full h-9 pl-9 pr-14 text-xs rounded-md bg-bg-elevated border border-border placeholder:text-text-muted focus:bg-bg-surface"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-text-muted bg-bg-surface border border-border-subtle rounded px-1.5 py-0.5">
            Enter
          </kbd>
        </div>
      </form>

      {/* Right chips */}
      <div className="flex items-center gap-1.5">
        <button
          title={`Refresh${now ? " · " + now : ""}`}
          onClick={() => location.reload()}
          className="w-9 h-9 inline-flex items-center justify-center rounded-md text-text-secondary hover:bg-bg-elevated transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        <UserChip user={user} />
      </div>
    </header>
  );
}

function UserChip({ user }: { user: TopBarProps["user"] }) {
  const [open, setOpen] = useState(false);
  const display = user?.name?.trim() || user?.email || "Guest";
  const subtitle = user?.role || (user?.email ?? "Not signed in");
  const initial = (display || "?").charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-2 pl-2 pr-2 h-9 rounded-md hover:bg-bg-elevated transition-colors cursor-pointer"
        title={user?.email || ""}
      >
        <div className="w-7 h-7 rounded-full bg-accent text-white inline-flex items-center justify-center text-[11px] font-semibold">
          {initial}
        </div>
        <div className={cn("hidden md:flex flex-col leading-tight text-left")}>
          <span className="text-xs font-semibold text-text-primary truncate max-w-[140px]">
            {display}
          </span>
          <span className="text-[10px] text-text-muted truncate max-w-[140px]">
            {subtitle}
          </span>
        </div>
        <ChevronDown className="hidden md:block w-3 h-3 text-text-muted" />
      </button>
      {open && user && (
        <div className="absolute right-0 mt-1 w-56 rounded-md border border-border-subtle bg-bg-surface shadow-card z-40 py-1">
          <div className="px-3 py-2 border-b border-border-subtle">
            <div className="text-xs font-semibold text-text-primary truncate">{user.name}</div>
            <div className="text-[10px] text-text-muted truncate">{user.email}</div>
          </div>
          <a
            href="/api/auth/logout"
            className="flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-bg-elevated"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </a>
        </div>
      )}
    </div>
  );
}
