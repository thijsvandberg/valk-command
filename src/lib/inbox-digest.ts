import { db } from "@/db";
import { newStoryRead, poUser, userTeamAssignment } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { listNewStories, type NewStoryQueryCtx } from "@/lib/new-stories-query";
import { readUserSetting } from "@/lib/user-settings";
import {
  buildTeamMap,
  classifyInboxRelevance,
  RELEVANCE_BUCKETS,
  RELEVANCE_BUCKET_LABELS,
  type RelevanceBucket,
  type RelevanceOptions,
  type UserTeamAssignment,
} from "@/lib/new-stories-grouping";
import type { Team } from "@/lib/sprint-utils";

// Inbox digest computation (BRDG-413). Pure window/timezone helpers plus the
// "new since the last inbox read" count, broken down by relevance bucket. Reuses
// the inbox's own query + classifier so there is a single source of truth: the
// digest counts exactly the rows the inbox would show, filtered to those that
// arrived after the user last marked something read.

// Fixed delivery windows. Treated as DUE times, not exact fire times: the lazy
// scheduler delivers a window the first time the user is active at/after it.
export type DigestWindowKey = "morning" | "afternoon";

export interface DigestWindow {
  key: DigestWindowKey;
  hour: number;
  minute: number;
}

export const WINDOWS: DigestWindow[] = [
  { key: "morning", hour: 9, minute: 0 },
  { key: "afternoon", hour: 13, minute: 0 },
];

// The PO works in Amsterdam; windows are local to that zone. Holiday calendars
// and a configurable timezone are explicitly out of scope (see the story).
export const TIMEZONE = "Europe/Amsterdam";

export interface DigestBucket {
  key: RelevanceBucket;
  label: string;
  count: number;
}

export interface InboxDigestResult {
  total: number;
  baselineAt: string | null;
  buckets: DigestBucket[];
}

// Wall-clock parts of `now` in the configured timezone. Intl handles DST, so the
// derived hour/minute and calendar date are correct across the spring/autumn
// transitions without any manual offset math.
function localParts(now: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

// Local calendar date as `YYYY-MM-DD`. Used as the per-day bookkeeping key so a
// day rolls over at local midnight, not UTC midnight.
export function localDateKey(now: Date): string {
  const { year, month, day } = localParts(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

// Monday–Friday in the configured timezone. Deriving the weekday from the local
// calendar date (rather than a locale weekday string) keeps it unambiguous.
export function isWeekday(now: Date): boolean {
  const { year, month, day } = localParts(now);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sun, 6 = Sat
  return dow >= 1 && dow <= 5;
}

// Windows whose due time has passed at `now` (local time), in WINDOWS order.
export function dueWindows(now: Date): DigestWindowKey[] {
  const { hour, minute } = localParts(now);
  const nowMinutes = hour * 60 + minute;
  return WINDOWS.filter((w) => w.hour * 60 + w.minute <= nowMinutes).map((w) => w.key);
}

// Normalizes a stored timestamp to epoch ms. jiraCreatedAt is ISO-8601 (has a
// "T"); newStoryRead.readAt can be SQLite's `datetime('now')` form
// ("YYYY-MM-DD HH:MM:SS", UTC, no zone) when written by a live read action. A
// naive string comparison of the two formats misfires within the same day
// (" " < "T"), so normalize both to ms before comparing. Returns NaN on garbage.
function parseStamp(value: string): number {
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return new Date(iso).getTime();
}

// Baseline = the last time this user took an explicit read action. Null when they
// have never marked anything read, in which case the whole current unread inbox
// counts as new (first-ever digest). Opening /inbox does not write a read row, so
// it cannot move this baseline.
export async function getInboxBaseline(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ max: sql<string | null>`max(${newStoryRead.readAt})` })
    .from(newStoryRead)
    .where(eq(newStoryRead.userId, userId));
  return row?.max ?? null;
}

// Reads the per-account default team (JSON-encoded by createUserJsonSettingRoute).
async function readDefaultTeam(userId: string): Promise<Team | null> {
  const raw = await readUserSetting("default_team", userId);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as Team | null;
  } catch {
    return null;
  }
}

// Builds the relevance classifier inputs server-side from the same tables the
// inbox reads on the client (team assignments + PO markers), so a server digest
// buckets rows identically to the inbox view.
async function loadRelevanceOptions(myTeam: Team): Promise<RelevanceOptions> {
  const teamRows = db.select().from(userTeamAssignment).all();
  const grouped = new Map<string, Team[]>();
  for (const r of teamRows) {
    const list = grouped.get(r.displayName) ?? [];
    list.push(r.team as Team);
    grouped.set(r.displayName, list);
  }
  const assignments: UserTeamAssignment[] = Array.from(grouped.entries()).map(
    ([displayName, teams]) => ({ displayName, teams }),
  );

  const poRows = db.select().from(poUser).all();
  const poAccountIds = new Set(
    poRows.map((r) => r.accountId).filter((id): id is string => !!id),
  );
  const poNames = new Set(poRows.map((r) => r.displayName));

  return { myTeam, teamMap: buildTeamMap(assignments), poAccountIds, poNames };
}

// Computes the new-since-baseline digest for the acting user. With no default
// team relevance cannot classify meaningfully, so the digest carries the total
// only (mirroring the inbox's date fallback).
export async function computeInboxDigest(
  ctx: NewStoryQueryCtx,
  now: Date,
): Promise<InboxDigestResult> {
  const baseline = await getInboxBaseline(ctx.userId);
  const candidates = await listNewStories(ctx);

  // A row with no (or unparseable) createdAt has no comparable arrival time;
  // treat it as new so it is never silently dropped (matches the inbox's
  // "unknown date sinks to Older" tolerance). When baseline is null the whole
  // unread inbox is new.
  const baselineMs = baseline === null ? null : parseStamp(baseline);
  const newRows = candidates.filter((r) => {
    if (baselineMs === null || Number.isNaN(baselineMs)) return true;
    if (r.jiraCreatedAt === null) return true;
    const createdMs = parseStamp(r.jiraCreatedAt);
    return Number.isNaN(createdMs) || createdMs > baselineMs;
  });

  const myTeam = await readDefaultTeam(ctx.userId);
  if (!myTeam) {
    return { total: newRows.length, baselineAt: baseline, buckets: [] };
  }

  const options = await loadRelevanceOptions(myTeam);
  const counts = new Map<RelevanceBucket, number>();
  for (const row of newRows) {
    const bucket = classifyInboxRelevance(row, options);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  const buckets: DigestBucket[] = RELEVANCE_BUCKETS.filter((b) => (counts.get(b) ?? 0) > 0).map(
    (b) => ({ key: b, label: RELEVANCE_BUCKET_LABELS[b], count: counts.get(b)! }),
  );

  return { total: newRows.length, baselineAt: baseline, buckets };
}
