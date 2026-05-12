/**
 * POST /api/ai/expand
 *
 * Body: { text: string }
 * Returns: { options: { label: string; text: string }[] }
 *
 * Server-side proxy to Google's Gemini API. The API key never reaches
 * the browser — it lives in GEMINI_API_KEY on the server.
 *
 * Returns three SHORT rewrites of the user's brief task. The three
 * options are roughly the same length and depth — just different
 * phrasings of the same content. The caller picks whichever wording
 * reads best, or cancels to keep the original input.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gemini-2.5-flash";
const MAX_INPUT_CHARS = 1000;
const MAX_OUTPUT_TOKENS = 800;

const PROMPT_TEMPLATE = (input: string) =>
  `You are a task description writer for a corporate task delegation system.

The user has typed a brief task. Produce THREE alternative rewrites of it.

Rules (apply to EACH of the three):
- 2 to 3 sentences total. Hard maximum 45 words. Keep it short.
- Plain prose only — no markdown, no bullets, no headers, no quotes, no emojis.
- Preserve the user's intent. Do not invent names, dates, deadlines, or facts
  not implied by the input.
- Use formal, professional English.

The three options should be roughly the same length and depth. They differ
only in wording and emphasis — three natural ways to say the same thing. They
must NOT differ by length (no "short / long / very long" split).

Return strict JSON with three string fields: option1, option2, option3.

Task: ${input}`;

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

interface StructuredOutput {
  option1?: string;
  option2?: string;
  option3?: string;
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
            temperature: 0.8,
            topP: 0.95,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                option1: { type: "STRING" },
                option2: { type: "STRING" },
                option3: { type: "STRING" },
              },
              required: ["option1", "option2", "option3"],
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
      { label: "Option 1", text: (parsed.option1 ?? "").trim() },
      { label: "Option 2", text: (parsed.option2 ?? "").trim() },
      { label: "Option 3", text: (parsed.option3 ?? "").trim() },
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
