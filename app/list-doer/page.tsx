"use client";

import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { Header } from "@/components/Header";
import { DoerList } from "@/components/DoerList";

export default function ListDoerPage() {
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
        icon={Users}
        title="All Doers"
        subtitle="Every team member in the Doer List. Click a doer to view their tasks."
      />

      <DoerList />
    </div>
  );
}
