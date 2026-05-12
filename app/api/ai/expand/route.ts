/**
 * POST /api/ai/expand
 *
 * Body: { text: string }
 * Returns: { expanded: string }
 *
 * Server-side proxy to Google's Gemini API. The API key never reaches the
 * browser — it lives in GEMINI_API_KEY on the server. Used by the AI
 * button on the task description field to rewrite a brief input into a
 * clearer, more actionable version.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gemini-2.5-flash";
const MAX_INPUT_CHARS = 800;
const MAX_OUTPUT_TOKENS = 220;

const PROMPT_TEMPLATE = (input: string) =>
  `You are a task description writer for a corporate task delegation system.
Rewrite the user's brief task into a clearer, more actionable single description.

Rules:
- 1 to 2 sentences, max 40 words total.
- Plain prose only. No headers, no lists, no bullets, no markdown, no emojis.
- Preserve the user's intent. Do not invent deadlines, names, or assumptions not in the input.
- Output ONLY the rewritten task. No preamble, no quotes.

Task: ${input}`;

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
  }[];
  promptFeedback?: { blockReason?: string };
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
            temperature: 0.4,
            topP: 0.9,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
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

    const expanded =
      json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
    if (!expanded) {
      return NextResponse.json({ error: "Empty response from AI." }, { status: 502 });
    }
    return NextResponse.json({ expanded });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
