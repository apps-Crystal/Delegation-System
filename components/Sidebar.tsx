"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  PlusCircle,
  ListChecks,
  Clock,
  PauseCircle,
  CheckCircle2,
  LogOut,
  Menu,
  X,
  Settings,
  ChevronDown,
  ClipboardList,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getTaskCounts, type CountKey } from "@/lib/api";

type NavItem = {
  href: string;
  label: string;
  icon?: React.ElementType;
  countKey?: CountKey;
};

type NavSection = {
  label: string;
  icon: React.ElementType;
  items: NavItem[];
};

interface SidebarProps {
  user?: { name: string; email: string; role: string } | null;
}

const sections: NavSection[] = [
  {
    label: "Tasks",
    icon: ClipboardList,
    items: [
      { href: "/add-task", label: "New Task" },
      { href: "/pending", label: "All Pending", countKey: "pending" },
      { href: "/follow-up", label: "Follow Up", countKey: "follow-up" },
      { href: "/overdue", label: "Overdue", countKey: "overdue" },
      { href: "/on-hold", label: "On Hold", countKey: "on-hold" },
      { href: "/completed", label: "Completed", countKey: "completed" },
    ],
  },
  {
    label: "Doers",
    icon: Users,
    items: [
      { href: "/add-doer", label: "Add Doer" },
      { href: "/list-doer", label: "List Doer" },
    ],
  },
];

const topItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
];

const settingsItems: NavItem[] = [
  { href: "/setup", label: "Setup & Health", icon: Settings },
];

/** Only this email sees Setup & Health in the sidebar. */
const SETUP_ADMIN_EMAIL = "apps@crystalgroup.in";

export function Sidebar({ user = null }: SidebarProps = {}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Record<CountKey, number>>({
    pending: 0,
    "follow-up": 0,
    "on-hold": 0,
    completed: 0,
    cancelled: 0,
    "week-shifted": 0,
    overdue: 0,
  });
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    Object.fromEntries(sections.map((s) => [s.label, true]))
  );

  useEffect(() => {
    getTaskCounts()
      .then(setCounts)
      .catch(() => {
        /* sheet not reachable yet — stay at zeros, no crash */
      });
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-30 flex items-center justify-center w-9 h-9 rounded-md bg-bg-surface border border-border hover:bg-bg-elevated transition-colors"
        aria-label="Open menu"
      >
        <Menu className="w-4 h-4 text-text-secondary" />
      </button>

      {/* Backdrop on mobile */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-60 bg-nav-base text-nav-text flex flex-col",
          "transition-transform duration-300 ease-out",
          "lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo / brand */}
        <div className="px-4 h-14 flex items-center justify-between border-b border-nav-border">
          <Link
            href="/"
            className="flex items-center gap-2.5 group"
            onClick={() => setOpen(false)}
          >
            <div className="w-7 h-7 rounded-md bg-white/10 border border-white/15 flex items-center justify-center">
              <span className="text-white text-xs font-bold">D</span>
            </div>
            <div className="leading-tight">
              <div className="text-white font-semibold text-[15px] tracking-tight">
                Delegate
              </div>
            </div>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden text-nav-muted hover:text-white"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3">
          {/* Top items (Dashboard) */}
          <ul className="px-2">
            {topItems.map((item) => (
              <li key={item.href}>
                <SidebarLink
                  item={item}
                  active={pathname === item.href}
                  count={undefined}
                  onClick={() => setOpen(false)}
                />
              </li>
            ))}
          </ul>

          {/* Collapsible sections */}
          {sections.map((section) => {
            const SecIcon = section.icon;
            const isOpen = openSections[section.label];
            const sectionActive = section.items.some((it) =>
              pathname.startsWith(it.href)
            );
            return (
              <div key={section.label} className="mt-1 px-2">
                <button
                  onClick={() =>
                    setOpenSections((s) => ({ ...s, [section.label]: !s[section.label] }))
                  }
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors",
                    sectionActive
                      ? "text-white"
                      : "text-nav-text hover:text-white"
                  )}
                >
                  <SecIcon
                    className="w-4 h-4 shrink-0 text-nav-muted"
                    strokeWidth={2}
                  />
                  <span className="flex-1 text-left">{section.label}</span>
                  <ChevronDown
                    className={cn(
                      "w-3.5 h-3.5 text-nav-muted transition-transform",
                      isOpen ? "rotate-0" : "-rotate-90"
                    )}
                  />
                </button>
                {isOpen && (
                  <ul className="mt-0.5 ml-2 pl-3 border-l border-nav-border space-y-0.5">
                    {section.items.map((item) => {
                      const isActive = pathname === item.href ||
                        (item.href !== "/" && pathname.startsWith(item.href));
                      const count = item.countKey ? counts[item.countKey] : undefined;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className={cn(
                              "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors",
                              isActive
                                ? "text-nav-active font-semibold"
                                : "text-nav-text hover:text-white"
                            )}
                          >
                            <span className="flex-1">{item.label}</span>
                            {count !== undefined && count > 0 && (
                              <span
                                className={cn(
                                  "text-[10px] font-mono px-1.5 py-0.5 rounded",
                                  isActive
                                    ? "bg-nav-active/15 text-nav-active"
                                    : "bg-white/5 text-nav-muted"
                                )}
                              >
                                {count}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}

          {/* Settings — only visible to the configured admin email */}
          {user?.email?.toLowerCase() === SETUP_ADMIN_EMAIL && (
            <ul className="mt-3 px-2">
              {settingsItems.map((item) => (
                <li key={item.href}>
                  <SidebarLink
                    item={item}
                    active={pathname.startsWith(item.href)}
                    count={undefined}
                    onClick={() => setOpen(false)}
                  />
                </li>
              ))}
            </ul>
          )}
        </nav>

        {/* Footer / user + logout */}
        <div className="border-t border-nav-border p-3">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-md">
            <div className="w-7 h-7 rounded-full bg-white/10 border border-white/15 inline-flex items-center justify-center text-[11px] text-white font-semibold">
              {(user?.name || user?.email || "?").charAt(0).toUpperCase()}
            </div>
            <div className="leading-tight min-w-0">
              <div className="text-white text-xs font-semibold truncate">
                {user?.name || "Not signed in"}
              </div>
              <div className="text-nav-active text-[10px] truncate">
                {user?.email || user?.role || ""}
              </div>
            </div>
          </div>
          <a
            href="/api/auth/logout"
            className="mt-1 w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-nav-text hover:bg-white/5 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4 text-nav-muted" strokeWidth={2} />
            <span>Sign out</span>
          </a>
        </div>
      </aside>
    </>
  );
}

function SidebarLink({
  item,
  active,
  count,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  count: number | undefined;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors",
        active
          ? "bg-nav-elevated text-nav-active"
          : "text-nav-text hover:bg-white/5 hover:text-white"
      )}
    >
      {Icon && (
        <Icon
          className={cn(
            "w-4 h-4 shrink-0",
            active ? "text-nav-active" : "text-nav-muted"
          )}
          strokeWidth={2}
        />
      )}
      <span className="flex-1">{item.label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "text-[10px] font-mono px-1.5 py-0.5 rounded",
            active ? "bg-nav-active/15 text-nav-active" : "bg-white/5 text-nav-muted"
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
