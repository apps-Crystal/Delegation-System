/**
 * POST /api/ai/expand
 *
 * Body: { text: string }
 * Returns: { options: { label: string; text: string }[] }
 *
 * Server-side proxy to Google's Gemini API. The API key never reaches
 * the browser — it lives in GEMINI_API_KEY on the server.
 *
 * Returns three labelled rewrites of the user's brief task description
 * so the caller can pick the framing that suits the situation best:
 *   - "Brief"        — one short, direct sentence.
 *   - "Detailed"     — 3–4 sentences with context and expected outcome.
 *   - "Step-by-step" — sequential actions written as prose ("First …,
 *                      then …, finally …") so the doer has an explicit
 *                      execution plan.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gemini-2.5-flash";
const MAX_INPUT_CHARS = 1000;
const MAX_OUTPUT_TOKENS = 1800;

const PROMPT_TEMPLATE = (input: string) =>
  `You are a task description writer for a corporate task delegation system.

The user has typed a brief task. Produce THREE different rewrites of it, each
useful for a different situation.

1. "brief"     — One short, direct sentence (10–20 words). Clear and actionable.
2. "detailed"  — Three to four sentences (40–70 words) that elaborate on what
                 needs to be done, why it matters, and the expected outcome.
                 Add reasonable, generic context only — do NOT invent specific
                 names, dates, deadlines, dollar figures or external facts.
3. "steps"     — A single-paragraph sequence of concrete actions (50–90 words)
                 written as prose using sequencing words ("First …, then …,
                 next …, finally …"). The doer should know exactly what order
                 to do things in after reading it.

Rules for ALL three:
- Plain prose only. No markdown, no bullets, no headers, no quotes, no emojis.
- Preserve the user's intent. Do not change what they are asking for.
- Use formal, professional English.

Task: ${input}`;

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

interface StructuredOutput {
  brief?: string;
  detailed?: string;
  steps?: string;
}

/**
 * Pull a JSON object out of Gemini's raw text response, tolerating:
 *   - markdown fences like ```json ... ```
 *   - leading/trailing prose
 *   - stray BOM / whitespace
 * Returns null when no plausible object can be located.
 */
function extractJsonObject(raw: string): string | null {
  if (!raw) return null;
  let s = raw.replace(/^﻿/, "").trim();
  // Strip markdown fences if present
  s = s.replace(/^```(?:json|JSON)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  if (s.startsWith("{") && s.endsWith("}")) return s;
  // Last-ditch: take the first balanced-looking {...} block
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) return s.slice(start, end + 1);
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not set on the server." },
        { status: 503 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { text?: unknown };
    const text = String(body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "Provide non-empty `text`." }, { status: 400 });
    }
    if (text.length > MAX_INPUT_CHARS) {
      return NextResponse.json(
        { error: `Input too long (>${MAX_INPUT_CHARS} chars).` },
        { status: 400 },
      );
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT_TEMPLATE(text) }] }],
          generationConfig: {
            temperature: 0.6,
            topP: 0.9,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                brief: { type: "STRING" },
                detailed: { type: "STRING" },
                steps: { type: "STRING" },
              },
              required: ["brief", "detailed", "steps"],
            },
          },
        }),
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Gemini API ${res.status}: ${detail.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const json = (await res.json()) as GeminiResponse;
    if (json.promptFeedback?.blockReason) {
      return NextResponse.json(
        { error: `AI declined to answer: ${json.promptFeedback.blockReason}` },
        { status: 422 },
      );
    }

    const candidate = json.candidates?.[0];
    const raw =
      candidate?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
    if (!raw) {
      return NextResponse.json({ error: "Empty response from AI." }, { status: 502 });
    }

    const cleaned = extractJsonObject(raw);
    if (!cleaned) {
      return NextResponse.json(
        {
          error: "AI returned non-JSON text. Try again.",
          finishReason: candidate?.finishReason,
          rawSample: raw.slice(0, 240),
        },
        { status: 502 },
      );
    }

    let parsed: StructuredOutput;
    try {
      parsed = JSON.parse(cleaned) as StructuredOutput;
    } catch {
      return NextResponse.json(
        {
          error:
            candidate?.finishReason === "MAX_TOKENS"
              ? "AI response was cut off (token limit). Try a shorter task."
              : "AI returned malformed JSON. Try again.",
          finishReason: candidate?.finishReason,
          rawSample: cleaned.slice(0, 240),
        },
        { status: 502 },
      );
    }

    const options = [
      { label: "Brief", text: (parsed.brief ?? "").trim() },
      { label: "Detailed", text: (parsed.detailed ?? "").trim() },
      { label: "Step-by-step", text: (parsed.steps ?? "").trim() },
    ].filter((o) => o.text.length > 0);

    if (options.length === 0) {
      return NextResponse.json({ error: "AI returned no usable text." }, { status: 502 });
    }

    return NextResponse.json({ options });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
