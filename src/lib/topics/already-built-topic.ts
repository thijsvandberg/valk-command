/**
 * "Already built" deep-scan topic (BRDG-287), topic #4 in the Backlog
 * Deprecation Review epic (docs/plans/2026-06-04-backlog-deprecation-review-epic.md).
 *
 * This is the most expensive topic: it submits a codebase-research skill call to
 * the workspace agent and blocks until the agent reports back. To keep costs under
 * control two independent mechanisms guard every invocation:
 *
 *   GATE: only tickets whose combined cheaper-topic score (staleness + replaced +
 *   duplicate, read from the ALREADY-PERSISTED scanScores) crosses
 *   ALREADY_BUILT_GATE_THRESHOLD are eligible. Below the threshold the scorer
 *   abstains immediately and the agent is never called.
 *
 *   HARD THROTTLE: at most ALREADY_BUILT_DAILY_CAP codebase checks per calendar
 *   day (UTC). The running count is stored in `app_setting` under the key
 *   `already-built-scan:<YYYY-MM-DD>`. When the cap is hit the scorer abstains AND
 *   logs the skipped ticket key so coverage is transparent. Skipped tickets are
 *   NOT marked as checked; they will be retried the next time the deep scan runs
 *   (the next day or when the PO kicks off another batch), because `run()` returns
 *   null (abstain) — `runDeepScan` does not write alreadyBuilt into scanScores in
 *   that case, leaving the slot empty and the ticket available for re-scan later.
 *
 * WHY read scanScores inside `run()` rather than passing pre-computed values:
 * `runDeepScan` does not expose intermediate topic results to later topics in the
 * same pass (the scorers run sequentially but share no in-memory state). The
 * cheapest reliable source of the earlier scores is the already-persisted
 * `ticketMetadata.scanScores` column, which is always at least as fresh as the
 * last Tier-1 or prior deep scan.
 */

import "server-only";
import { db } from "@/db";
import { appSetting, ticketMetadata } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import {
  registerTopicScorer,
  type DeprecationTopicScorer,
  type DeprecationTicketContext,
  type TopicScoreResult,
} from "@/lib/deprecation-topics";
import { runAgentTaskToCompletion, type RunAgentTaskOptions } from "@/lib/agent-task-result";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Combined cheaper-topic score (staleness + replaced + duplicate) that a ticket
 * must meet or exceed before we spend the expensive codebase-research call.
 * 0.4 = "already shows at least one mild signal". Empirically, a ticket with zero
 * signal from all three cheaper topics is very unlikely to be already-built.
 */
export const ALREADY_BUILT_GATE_THRESHOLD = 0.4;

/**
 * Maximum number of codebase-research agent calls per calendar day (UTC). This
 * is a hard, transparent cap: the log reveals what was skipped.
 */
export const ALREADY_BUILT_DAILY_CAP = 20;

/** app_setting key prefix. The suffix is the UTC date YYYY-MM-DD. */
const SETTING_KEY_PREFIX = "already-built-scan";

// ---------------------------------------------------------------------------
// Injectable helpers (test overrides)
// ---------------------------------------------------------------------------

/** Reads the current count string from app_setting for today's key. */
export type ReadDailyCountFn = (key: string) => Promise<string | null>;

/** Writes (upserts) the count string into app_setting. */
export type WriteDailyCountFn = (key: string, value: string) => Promise<void>;

/** Runs the codebase-research agent task to completion. */
export type RunAgentFn = (
  request: { skill: string; args: Record<string, unknown>; conversationId: string },
  options?: RunAgentTaskOptions,
) => Promise<{ ok: boolean; output?: string; reason?: string; error?: string }>;

async function readDailyCountDefault(key: string): Promise<string | null> {
  const row = await db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, key))
    .get();
  return row?.value ?? null;
}

async function writeDailyCountDefault(key: string, value: string): Promise<void> {
  await db
    .insert(appSetting)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSetting.key, set: { value } });
}

let activeReadCount: ReadDailyCountFn = readDailyCountDefault;
let activeWriteCount: WriteDailyCountFn = writeDailyCountDefault;
let activeRunAgent: RunAgentFn = runAgentTaskToCompletion;

/** Test-only: swap the daily-count reader. */
export function _setReadCountFn(fn: ReadDailyCountFn): void {
  activeReadCount = fn;
}

/** Test-only: restore the DB-backed daily-count reader. */
export function _resetReadCountFn(): void {
  activeReadCount = readDailyCountDefault;
}

/** Test-only: swap the daily-count writer. */
export function _setWriteCountFn(fn: WriteDailyCountFn): void {
  activeWriteCount = fn;
}

/** Test-only: restore the DB-backed daily-count writer. */
export function _resetWriteCountFn(): void {
  activeWriteCount = writeDailyCountDefault;
}

/** Test-only: swap the agent runner. */
export function _setRunAgentFn(fn: RunAgentFn): void {
  activeRunAgent = fn;
}

/** Test-only: restore the real agent runner. */
export function _resetRunAgentFn(): void {
  activeRunAgent = runAgentTaskToCompletion;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns today's UTC date string YYYY-MM-DD for the throttle key. */
function todayUtc(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Builds the app_setting key for the given UTC date. */
function dailySettingKey(date: string): string {
  return `${SETTING_KEY_PREFIX}:${date}`;
}

/**
 * Read the combined cheaper-topic score for a ticket from the already-persisted
 * scanScores in ticketMetadata. Sums staleness, replaced, and duplicate. Returns
 * 0 when no metadata row exists yet (ticket not yet deep-scanned at all).
 *
 * WHY sum (not weighted average): we want to gate on "any notable signal from the
 * cheaper topics", not on "on average". The threshold (0.4) is set against the
 * raw sum so that even a single mid-strength signal (e.g. staleness 0.5) is
 * sufficient, while truly un-touched tickets (all three near zero) are skipped.
 */
async function readCheaperTopicSum(jiraKey: string): Promise<number> {
  const meta = await db
    .select({ scanScores: ticketMetadata.scanScores })
    .from(ticketMetadata)
    .where(eq(ticketMetadata.jiraKey, jiraKey))
    .get();

  if (!meta?.scanScores) return 0;

  let parsed: Record<string, { score?: number }> = {};
  try {
    const raw = JSON.parse(meta.scanScores);
    if (raw && typeof raw === "object") parsed = raw as typeof parsed;
  } catch {
    return 0;
  }

  const staleness = typeof parsed.staleness?.score === "number" ? parsed.staleness.score : 0;
  const replaced = typeof parsed.replaced?.score === "number" ? parsed.replaced.score : 0;
  const duplicate = typeof parsed.duplicate?.score === "number" ? parsed.duplicate.score : 0;

  return staleness + replaced + duplicate;
}

// ---------------------------------------------------------------------------
// Agent prompt + response parsing
// ---------------------------------------------------------------------------

interface AlreadyBuiltEvidence {
  /** Implementing file, area, or Done-ticket key, if detected. */
  implementedIn: string | null;
  /** Whether the agent returned a parseable positive answer. */
  detected: boolean;
  /** True when the agent was unavailable/errored and we degraded gracefully. */
  degraded: boolean;
}

/**
 * Build a focused codebase-research prompt. WHY short and specific: the agent
 * does a semantic search of the product codebase; a vague question produces
 * false positives. We anchor it with the ticket title + description so the agent
 * looks for the exact described feature.
 */
function buildAlreadyBuiltPrompt(ticket: DeprecationTicketContext): string {
  const description = (ticket.description ?? "").slice(0, 1500);
  return [
    `Backlog ticket ${ticket.jiraKey}: "${ticket.title}"`,
    description ? `Description: ${description}` : "",
    ``,
    `Question: Is the feature or change described in this ticket ALREADY IMPLEMENTED in the`,
    `product codebase, OR covered by a Done/Closed Jira ticket?`,
    ``,
    `Search the codebase and recent Done tickets. Respond with EXACTLY three lines and nothing else:`,
    `IMPLEMENTED: YES or NO`,
    `IMPLEMENTED_IN: the implementing file path, component name, or Done ticket key (or UNKNOWN)`,
    `RATIONALE: one short sentence (max 140 chars) explaining the answer.`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

interface ParsedAlreadyBuiltResult {
  implemented: boolean;
  implementedIn: string | null;
  rationale: string;
}

/**
 * Parse the agent's three-line answer. Tolerant of surrounding whitespace and
 * markdown. An unparseable answer is treated as NOT implemented so it never
 * falsely promotes a ticket.
 */
export function parseAlreadyBuiltResult(output: string): ParsedAlreadyBuiltResult {
  const implMatch = output.match(/IMPLEMENTED:\s*(YES|NO)/i);
  const inMatch = output.match(/IMPLEMENTED_IN:\s*(.+)/i);
  const ratMatch = output.match(/RATIONALE:\s*(.+)/i);

  const implemented = implMatch ? implMatch[1].toUpperCase() === "YES" : false;

  let implementedIn: string | null = null;
  if (inMatch) {
    const raw = inMatch[1].replace(/^["'`*\s]+|["'`*\s]+$/g, "").trim();
    if (raw && raw.toUpperCase() !== "UNKNOWN") implementedIn = raw.slice(0, 200);
  }

  let rationale = ratMatch ? ratMatch[1].replace(/^["'`*\s]+|["'`*\s]+$/g, "").trim() : "";
  rationale = rationale.slice(0, 140);
  if (!rationale) {
    rationale = implemented
      ? "Appears already implemented in the product."
      : "No evidence the feature is already built.";
  }

  return { implemented, implementedIn, rationale };
}

// ---------------------------------------------------------------------------
// Scorer
// ---------------------------------------------------------------------------

export const ALREADY_BUILT_TOPIC: DeprecationTopicScorer = {
  key: "alreadyBuilt",
  label: "Already built",
  weight: 1,
  // A lower maxContribution than weight means this topic can add meaningful
  // signal but cannot single-handedly push a ticket to candidate. A codebase
  // search is expensive and occasionally noisy; the PO should see this as
  // corroborating evidence rather than a definitive verdict.
  maxContribution: 0.8,

  async run(ticket: DeprecationTicketContext, ctx): Promise<TopicScoreResult | null> {
    // GATE: read the combined cheaper-topic score from persisted scanScores.
    // We do this before the throttle check so a below-threshold ticket never
    // burns a daily slot.
    const cheaperSum = await readCheaperTopicSum(ticket.jiraKey);
    if (cheaperSum < ALREADY_BUILT_GATE_THRESHOLD) {
      return null;
    }

    // HARD THROTTLE: enforce the daily cap via app_setting.
    const date = todayUtc(ctx.now);
    const settingKey = dailySettingKey(date);

    const currentRaw = await activeReadCount(settingKey);
    const currentCount = currentRaw ? parseInt(currentRaw, 10) || 0 : 0;

    if (currentCount >= ALREADY_BUILT_DAILY_CAP) {
      // Transparent log: no silent caps. The ticket is NOT marked as checked so
      // the next deep-scan batch on a new day will retry it.
      logger.warn("already-built-topic", "daily codebase-research cap reached; skipping ticket", {
        jiraKey: ticket.jiraKey,
        cap: ALREADY_BUILT_DAILY_CAP,
        date,
      });
      return null;
    }

    // Increment the counter before the agent call so that concurrent scans
    // (if ever introduced) do not all race past the cap.
    await activeWriteCount(settingKey, String(currentCount + 1));

    // AGENT CALL: codebase-research skill.
    const prompt = buildAlreadyBuiltPrompt(ticket);
    const result = await activeRunAgent(
      {
        skill: "codebase-research",
        args: { prompt },
        conversationId: `already-built-${ticket.jiraKey}-${ctx.now}`,
      },
    );

    if (!result.ok) {
      // Degrade gracefully: agent unavailable. The counter was already incremented
      // (we did spend the slot), but we abstain so this failure does not falsely
      // score the ticket. The ticket remains available for re-scan.
      logger.warn("already-built-topic", "agent codebase-research unavailable; abstaining", {
        jiraKey: ticket.jiraKey,
        reason: result.reason,
      });
      return null;
    }

    const parsed = parseAlreadyBuiltResult(result.output ?? "");

    if (!parsed.implemented) {
      // Agent found no evidence the feature exists. Abstain so we don't dilute
      // the weighted average for tickets that are genuinely not yet built.
      return null;
    }

    const evidence: AlreadyBuiltEvidence = {
      implementedIn: parsed.implementedIn,
      detected: true,
      degraded: false,
    };

    return {
      // High confidence when the agent found a concrete reference; slightly lower
      // when it detected implementation but could not cite a specific location.
      score: parsed.implementedIn ? 0.9 : 0.75,
      evidence,
      rationale: "Appears already implemented",
    };
  },
};

registerTopicScorer(ALREADY_BUILT_TOPIC);
