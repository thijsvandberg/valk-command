import { readUserSetting, writeUserSetting, GLOBAL_USER } from "@/lib/user-settings";
import {
  computeInboxDigest,
  dueWindows,
  isWeekday,
  localDateKey,
  type DigestBucket,
  type DigestWindowKey,
} from "@/lib/inbox-digest";
import type { NewStoryQueryCtx } from "@/lib/new-stories-query";

// Per-user inbox digest delivery state (BRDG-413). The lazy scheduler evaluates
// this on every read of GET /api/inbox/digest: a window is "delivered" the first
// time the user is active at/after its due time, capped at the two weekday
// windows. State is server-written only (the client can only dismiss), so the
// per-day cap cannot be forged from the browser.

const SETTING_KEY = "inbox_digest";

// The currently displayed digest. Null between deliveries / after a dismiss.
export interface ActiveDigest {
  /** `<date>:<window>` dedupe / render key, e.g. "2026-06-26:afternoon". */
  id: string;
  generatedAt: string;
  /** The read action this is measured from; null on a first-ever digest. */
  baselineAt: string | null;
  total: number;
  /** Empty when no default team is set (total-only digest). */
  buckets: DigestBucket[];
}

export interface InboxDigestState {
  active: ActiveDigest | null;
  /** Local (Amsterdam) date the bookkeeping below belongs to. */
  deliveryDate: string;
  /** Windows already spent today; resets on day rollover. */
  deliveredWindows: DigestWindowKey[];
}

function emptyState(today: string): InboxDigestState {
  return { active: null, deliveryDate: today, deliveredWindows: [] };
}

async function readDigestState(userId: string): Promise<InboxDigestState | null> {
  const raw = await readUserSetting(SETTING_KEY, userId);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as InboxDigestState;
  } catch {
    return null;
  }
}

async function writeDigestState(userId: string, state: InboxDigestState): Promise<void> {
  await writeUserSetting(SETTING_KEY, userId, JSON.stringify(state));
}

/**
 * Evaluate the user's digest for `now` and return the active digest (or null).
 * Lazy-cron applied per request:
 *  - day rollover resets the per-day bookkeeping;
 *  - weekends generate nothing (an already-active digest still displays);
 *  - a due-but-unconsumed window delivers a fresh digest only when something new
 *    has arrived; an empty window is not spent (the slot stays open until the day
 *    ends or something arrives);
 *  - delivering consumes ALL currently-due unconsumed windows, so arriving at
 *    14:00 shows one banner and spends both slots, never two banners at once.
 */
export async function evaluateInboxDigest(
  ctx: NewStoryQueryCtx,
  now: Date,
): Promise<ActiveDigest | null> {
  // Never deliver a digest for the anonymous "global" fallback (BRDG-453). That
  // identity carries no per-user read state, so its baseline is always null and
  // the digest would announce the entire unread inbox as "new" — the misleading
  // "hundreds of new" banner seen when a dev-bypass request resolves to global
  // while real read-state lives under the signed-in Clerk user. Production always
  // forwards a real user id (middleware 401s otherwise), so this only ever
  // suppresses the meaningless global digest in dev.
  if (ctx.userId === GLOBAL_USER) return null;

  const today = localDateKey(now);
  let state = (await readDigestState(ctx.userId)) ?? emptyState(today);
  let changed = false;

  if (state.deliveryDate !== today) {
    state = { ...state, deliveryDate: today, deliveredWindows: [] };
    changed = true;
  }

  if (!isWeekday(now)) {
    if (changed) await writeDigestState(ctx.userId, state);
    return state.active;
  }

  const unconsumed = dueWindows(now).filter((w) => !state.deliveredWindows.includes(w));
  if (unconsumed.length > 0) {
    const digest = await computeInboxDigest(ctx, now);
    if (digest.total > 0) {
      // The latest due window names the delivery (afternoon when both are due).
      const windowKey = unconsumed[unconsumed.length - 1];
      const active: ActiveDigest = {
        id: `${today}:${windowKey}`,
        generatedAt: now.toISOString(),
        baselineAt: digest.baselineAt,
        total: digest.total,
        buckets: digest.buckets,
      };
      state = {
        ...state,
        active,
        deliveredWindows: [...state.deliveredWindows, ...unconsumed],
      };
      changed = true;
    }
    // Nothing new: leave `active` and `deliveredWindows` untouched (empty window
    // not spent).
  }

  if (changed) await writeDigestState(ctx.userId, state);
  return state.active;
}

/**
 * Clear the active digest (Open inbox / Dismiss). Leaves `deliveredWindows`
 * intact so the spent slot is not refilled the same day.
 */
export async function clearActiveDigest(userId: string): Promise<void> {
  const state = await readDigestState(userId);
  if (!state || state.active === null) return;
  await writeDigestState(userId, { ...state, active: null });
}
