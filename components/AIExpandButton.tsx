"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2, Check } from "lucide-react";
import { expandTaskDescription, type AIInsight } from "@/lib/api";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

/**
 * Sparkles button that asks Gemini for three labelled rewrites of the
 * current text (Brief / Detailed / Step-by-step). On success a modal
 * opens with the three options side by side; the user picks one to
 * replace the textarea, or cancels to keep the original input.
 *
 * Strictly opt-in — the button never triggers automatically.
 */
interface AIExpandButtonProps {
  text: string;
  onExpand: (expanded: string) => void;
  className?: string;
}

export function AIExpandButton({ text, onExpand, className }: AIExpandButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<AIInsight[] | null>(null);
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4500);
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
      const opts = await expandTaskDescription(trimmed);
      if (opts.length === 0) {
        setError("AI returned no options. Try again.");
        return;
      }
      setOptions(opts);
      setPickedIndex(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI failed.");
    } finally {
      setLoading(false);
    }
  };

  const applyPicked = () => {
    if (options && pickedIndex !== null) {
      onExpand(options[pickedIndex].text);
    }
    setOptions(null);
    setPickedIndex(null);
  };

  const closeModal = () => {
    setOptions(null);
    setPickedIndex(null);
  };

  return (
    <div className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        title="Get AI insights for this description"
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

      {options && (
        <Modal
          open
          onClose={closeModal}
          title="Choose an AI insight"
          description="Three rewrites of your task. Pick one to replace your text, or close to keep what you wrote."
          className="max-w-2xl"
        >
          <div className="space-y-3">
            {options.map((opt, idx) => {
              const picked = pickedIndex === idx;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setPickedIndex(idx)}
                  className={cn(
                    "w-full text-left rounded-lg border p-4 transition-colors",
                    picked
                      ? "border-accent bg-accent/5 ring-2 ring-accent/30"
                      : "border-border-subtle bg-bg-elevated hover:border-border-strong",
                  )}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] font-semibold text-text-muted">
                      <Sparkles className="w-3 h-3 text-accent" />
                      {opt.label}
                    </span>
                    {picked && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent">
                        <Check className="w-3.5 h-3.5" />
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-text-primary leading-relaxed whitespace-pre-wrap">
                    {opt.text}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-4 mt-2 border-t border-border-subtle">
            <p className="text-[11px] text-text-muted">
              {pickedIndex === null
                ? "Tap a card to select."
                : `Selected: ${options[pickedIndex].label}`}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeModal}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={applyPicked}
                disabled={pickedIndex === null}
              >
                Use this
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
