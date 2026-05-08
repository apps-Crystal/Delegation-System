"use client";

import { useEffect, useState } from "react";
import { Search, RefreshCw, Bell, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TopBarProps {
  site?: string;
  online?: boolean;
}

/**
 * App-wide top bar — site label, online indicator, command-K search,
 * refresh, notifications, and the user chip on the right.
 *
 * Search and notifications are visual-only for now; refresh just reloads
 * the current route. Wire-up can come later.
 */
export function TopBar({ site = "Kolkata", online = true }: TopBarProps) {
  const [now, setNow] = useState<string>("");
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
      <div className="flex-1 max-w-xl mx-auto">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            placeholder="Search tasks, doers..."
            className="w-full h-9 pl-9 pr-14 text-xs rounded-md bg-bg-elevated border border-border placeholder:text-text-muted focus:bg-bg-surface"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-text-muted bg-bg-surface border border-border-subtle rounded px-1.5 py-0.5">
            Ctrl K
          </kbd>
        </div>
      </div>

      {/* Right chips */}
      <div className="flex items-center gap-1.5">
        <button
          title={`Refresh${now ? " · " + now : ""}`}
          onClick={() => location.reload()}
          className="w-9 h-9 inline-flex items-center justify-center rounded-md text-text-secondary hover:bg-bg-elevated transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        <button
          title="Notifications"
          className="relative w-9 h-9 inline-flex items-center justify-center rounded-md text-text-secondary hover:bg-bg-elevated transition-colors"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1.5 min-w-[14px] h-[14px] text-[9px] font-semibold text-white bg-status-revise rounded-full inline-flex items-center justify-center px-1">
            3
          </span>
        </button>

        <UserChip />
      </div>
    </header>
  );
}

function UserChip() {
  return (
    <div className="flex items-center gap-2 pl-2 pr-2 h-9 rounded-md hover:bg-bg-elevated transition-colors cursor-pointer">
      <div className="w-7 h-7 rounded-full bg-accent text-white inline-flex items-center justify-center text-[11px] font-semibold">
        K
      </div>
      <div className={cn("hidden md:flex flex-col leading-tight")}>
        <span className="text-xs font-semibold text-text-primary">
          Karan Malhotra
        </span>
        <span className="text-[10px] text-text-muted">System_Admin</span>
      </div>
      <ChevronDown className="hidden md:block w-3 h-3 text-text-muted" />
    </div>
  );
}
