"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mic button that turns spoken English into text using the browser's
 * Web Speech API. Each finalised chunk is appended via `onAppend`.
 *
 * Supported in Chromium-based browsers (Chrome, Edge) and Safari.
 * Firefox does not implement SpeechRecognition; in that case the button
 * is rendered disabled with a clarifying tooltip.
 */

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{
    0: { transcript: string };
    isFinal: boolean;
  }>;
}

interface VoiceInputProps {
  onAppend: (text: string) => void;
  className?: string;
  /** Default 'en-IN'. Override for other locales. */
  lang?: string;
  title?: string;
}

function getRecognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceInput({
  onAppend,
  className,
  lang = "en-IN",
  title = "Speak to fill this field",
}: VoiceInputProps) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
  }, []);

  // Auto-clear transient error after a few seconds
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  const start = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = lang;

    rec.onresult = (e) => {
      // Only emit finalised chunks; concatenate them with a leading space so
      // multiple sessions in the same field don't run words together.
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const text = r[0].transcript.trim();
          if (text) onAppend(text);
        }
      }
    };
    rec.onerror = (e) => {
      const map: Record<string, string> = {
        "not-allowed": "Microphone permission denied.",
        "service-not-allowed": "Microphone permission denied.",
        "no-speech": "No speech detected. Try again.",
        "audio-capture": "No microphone found.",
        network: "Network error during speech recognition.",
      };
      setError(map[e.error] ?? `Speech error: ${e.error}`);
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };

    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start mic.");
      setListening(false);
    }
  };

  const stop = () => {
    recRef.current?.stop();
    setListening(false);
  };

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        title="Voice input is not supported in this browser. Try Chrome or Edge."
        className={cn(
          "inline-flex items-center justify-center w-8 h-8 rounded-md text-text-muted/40 cursor-not-allowed",
          className,
        )}
      >
        <MicOff className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={listening ? stop : start}
        title={listening ? "Stop listening" : title}
        className={cn(
          "inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors",
          listening
            ? "bg-status-revise/10 text-status-revise hover:bg-status-revise/20"
            : "text-text-muted hover:bg-bg-elevated hover:text-accent",
        )}
      >
        {listening ? (
          <span className="relative inline-flex">
            <Mic className="w-4 h-4" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-status-revise animate-pulse" />
          </span>
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </button>
      {error && (
        <span className="absolute top-full right-0 mt-1 whitespace-nowrap text-[10px] text-status-revise bg-bg-surface border border-status-revise/30 rounded px-2 py-0.5 shadow-sm z-10">
          {error}
        </span>
      )}
      {listening && !error && (
        <span className="absolute top-full right-0 mt-1 whitespace-nowrap text-[10px] text-status-revise flex items-center gap-1 bg-bg-surface border border-status-revise/30 rounded px-2 py-0.5 shadow-sm">
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
          Listening…
        </span>
      )}
    </div>
  );
}
