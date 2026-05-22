import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "@/lib/env";
import { applyRateLimit } from "@/lib/rate-limiter";

const requestSchema = z.object({
  tickets: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      points: z.number().nullable(),
      epicName: z.string().nullable(),
    })
  ).min(1).max(200),
});

export async function POST(request: Request) {
  const limited = applyRateLimit("workspace");
  if (limited) return limited;

  if (!env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI features are not configured. Set ANTHROPIC_API_KEY in environment." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { tickets } = parsed.data;

  const ticketLines = tickets
    .map((t) => {
      const parts = [`- ${t.key}: "${t.title}"`];
      if (t.points != null) parts.push(`(${t.points} pts)`);
      if (t.epicName) parts.push(`[Epic: ${t.epicName}]`);
      return parts.join(" ");
    })
    .join("\n");

  const systemPrompt = [
    "You rewrite Jira ticket titles into short, non-technical summaries for business stakeholders.",
    "Rules:",
    "- Max 10 words per title",
    "- Focus on business outcome or user impact, not implementation details",
    "- No jargon, no technical terms (no API, middleware, refactor, pipeline, etc.)",
    "- Write in past tense or present tense depending on what reads best",
    "- Return ONLY valid JSON, no markdown fences, no explanation",
    '- Format: { "tickets": [{ "key": "TICKET-1", "title": "Rewritten title" }, ...] }',
    "- Preserve the exact ticket keys from input",
  ].join("\n");

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Rewrite these ticket titles for stakeholders:\n\n${ticketLines}`,
        },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const aiResult = JSON.parse(text) as { tickets: { key: string; title: string }[] };

    if (!Array.isArray(aiResult.tickets)) {
      throw new Error("AI response missing tickets array");
    }

    return NextResponse.json({ tickets: aiResult.tickets });
  } catch {
    // Fallback: return original titles so the client can still produce useful output
    const fallback = tickets.map((t) => ({ key: t.key, title: t.title }));
    return NextResponse.json(
      { tickets: fallback, fallback: true },
      { status: 200 },
    );
  }
}
