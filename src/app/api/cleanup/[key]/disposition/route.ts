/**
 * Per-ticket score breakdown + disposition API for the Backlog Deprecation
 * Review epic (BRDG-289, see docs/plans/2026-06-04-backlog-deprecation-review-epic.md).
 *
 * GET  returns the full scan breakdown for one ticket: every persisted topic
 *      score with its evidence, the assembled scanRationale, the overall score,
 *      and the current disposition (+ cooldown + note). The /cleanup list only
 *      carries numeric scores, so the review drawer fetches the rich detail here.
 *
 * POST applies a disposition action (confirm | dismiss | reset). Dismiss snoozes
 *      the ticket for DISMISS_COOLDOWN_DAYS so it is not re-surfaced by the
 *      background runner until the cooldown elapses. Local-only: never writes Jira.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { ticket, ticketMetadata } from "@/db/schema";
import { eq } from "drizzle-orm";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";
import { applyDisposition } from "@/lib/cleanup-disposition-service";
import { MAX_DISPOSITION_NOTE_LENGTH } from "@/lib/cleanup-disposition";
import { SCAN_TOPICS, type ScanTopicKey, type Disposition } from "@/lib/cleanup-types";

interface TopicBreakdown {
  key: ScanTopicKey;
  label: string;
  live: boolean;
  score: number | null;
  evidence: unknown;
  rationale: string | null;
}

export interface DispositionDetail {
  key: string;
  title: string;
  status: string;
  scanOverall: number | null;
  scanRationale: string | null;
  lastScannedAt: string | null;
  lastDeepScannedAt: string | null;
  disposition: Disposition;
  dispositionUntil: string | null;
  dispositionNote: string | null;
  topics: TopicBreakdown[];
}

const bodySchema = z.object({
  action: z.enum(["confirm", "dismiss", "reset"]),
  note: z.string().max(MAX_DISPOSITION_NOTE_LENGTH).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const row = await db
    .select({
      key: ticket.jiraKey,
      title: ticket.title,
      status: ticket.status,
      scanScores: ticketMetadata.scanScores,
      scanOverall: ticketMetadata.scanOverall,
      scanRationale: ticketMetadata.scanRationale,
      lastScannedAt: ticketMetadata.lastScannedAt,
      lastDeepScannedAt: ticketMetadata.lastDeepScannedAt,
      disposition: ticketMetadata.disposition,
      dispositionUntil: ticketMetadata.dispositionUntil,
      dispositionNote: ticketMetadata.dispositionNote,
    })
    .from(ticket)
    .leftJoin(ticketMetadata, eq(ticket.jiraKey, ticketMetadata.jiraKey))
    .where(eq(ticket.jiraKey, key))
    .get();

  if (!row) return errorResponse("Ticket not found", 404);

  // Parse the per-topic map once; one corrupt entry degrades to "no score" for
  // that topic rather than failing the whole breakdown.
  const parsed = parseFullScanScores(row.scanScores);

  const topics: TopicBreakdown[] = SCAN_TOPICS.map((t) => {
    const entry = parsed[t.key];
    return {
      key: t.key,
      label: t.label,
      live: t.live,
      score: entry && typeof entry.score === "number" ? entry.score : null,
      evidence: entry?.evidence ?? null,
      rationale: typeof entry?.rationale === "string" ? entry.rationale : null,
    };
  });

  const body: DispositionDetail = {
    key: row.key,
    title: row.title,
    status: row.status,
    scanOverall: row.scanOverall ?? null,
    scanRationale: row.scanRationale ?? null,
    lastScannedAt: row.lastScannedAt ?? null,
    lastDeepScannedAt: row.lastDeepScannedAt ?? null,
    disposition: (row.disposition ?? null) as Disposition,
    dispositionUntil: row.dispositionUntil ?? null,
    dispositionNote: row.dispositionNote ?? null,
    topics,
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;

  const validation = bodySchema.safeParse(parsed.data);
  if (!validation.success) {
    return errorResponse(validation.error.issues[0]?.message ?? "Invalid request body", 400);
  }

  const { action, note } = validation.data;
  const result = await applyDisposition([key], action, { note });

  if (result.applied.length === 0) {
    return errorResponse("Ticket not found", 404);
  }

  return NextResponse.json({ key, action, applied: true });
}

interface RawTopicEntry {
  score?: number;
  evidence?: unknown;
  rationale?: string;
}

function parseFullScanScores(raw: string | null): Partial<Record<ScanTopicKey, RawTopicEntry>> {
  const out: Partial<Record<ScanTopicKey, RawTopicEntry>> = {};
  if (!raw) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!parsed || typeof parsed !== "object") return out;
  const map = parsed as Record<string, unknown>;
  for (const topic of SCAN_TOPICS) {
    const entry = map[topic.key];
    if (entry && typeof entry === "object") {
      out[topic.key] = entry as RawTopicEntry;
    }
  }
  return out;
}
