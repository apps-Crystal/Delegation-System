"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { expandTaskDescription } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Sparkles button that asks Gemini to rewrite the current text into a
 * clearer, more actionable task description. Replaces the textarea
 * content on success. Strictly opt-in — never triggers automatically.
 */
interface AIExpandButtonProps {
  /** Current textarea content; the button reads this and sends it to the API. */
  text: string;
  /** Called with the AI-rewritten text. Caller decides how to integrate. */
  onExpand: (expanded: string) => void;
  className?: string;
}

export function AIExpandButton({ text, onExpand, className }: AIExpandButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  const handleClick = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Type or speak something first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const expanded = await expandTaskDescription(trimmed);
      if (expanded) onExpand(expanded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        title="Improve the description with AI"
        className={cn(
          "inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors",
          loading
            ? "text-accent bg-accent/10"
            : "text-text-muted hover:bg-bg-elevated hover:text-accent",
          "disabled:cursor-wait",
        )}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
      </button>
      {error && (
        <span className="absolute top-full right-0 mt-1 whitespace-nowrap text-[10px] text-status-revise bg-bg-surface border border-status-revise/30 rounded px-2 py-0.5 shadow-sm z-10">
          {error}
        </span>
      )}
      {loading && !error && (
        <span className="absolute top-full right-0 mt-1 whitespace-nowrap text-[10px] text-accent bg-bg-surface border border-accent/30 rounded px-2 py-0.5 shadow-sm z-10">
          Thinking…
        </span>
      )}
    </div>
  );
}
