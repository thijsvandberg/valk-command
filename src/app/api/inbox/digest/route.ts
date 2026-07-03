import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limiter";
import { resolveUserId } from "@/lib/user-settings";
import { resolveNewStoryQueryCtx } from "@/lib/new-stories-ctx";
import {
  evaluateInboxDigest,
  clearActiveDigest,
  snoozeActiveDigest,
} from "@/lib/inbox-digest-store";

// GET /api/inbox/digest - evaluate (lazy-cron) and return the acting user's
// active inbox digest, or null (BRDG-413). This GET mutates per-day delivery
// bookkeeping, so it must never be cached; the SWR poll on the banner drives the
// evaluation by hitting this on an interval + on focus.
export async function GET() {
  const ctx = await resolveNewStoryQueryCtx();
  const active = await evaluateInboxDigest(ctx, new Date());
  return NextResponse.json({ active }, { headers: { "Cache-Control": "private, no-store" } });
}

// DELETE /api/inbox/digest - dismiss the active digest (Open inbox / Dismiss).
// The delivery cap (deliveredWindows) is preserved server-side, so a dismissed
// slot is not refilled the same day.
export async function DELETE() {
  const limited = await applyRateLimit("delete");
  if (limited) return limited;

  const userId = await resolveUserId();
  await clearActiveDigest(userId);
  return NextResponse.json({ ok: true });
}

// POST /api/inbox/digest - snooze the active digest for an hour (BRDG-462). The
// banner is suppressed server-side until the snooze elapses, then resurfaces on
// the next GET; the delivery cap (deliveredWindows) is left untouched.
export async function POST() {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const userId = await resolveUserId();
  await snoozeActiveDigest(userId, new Date());
  return NextResponse.json({ ok: true });
}
