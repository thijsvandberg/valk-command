import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { userSetting } from "@/db/schema";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { logger } from "@/lib/logger";

const USER_HEADER = "x-bridge-user-id";

// Reserved owner for settings written without a resolvable session (dev bypass,
// unit tests, or outside a request scope). Mirrors the rate-limiter's fallback
// so callers never have to special-case the absence of a Clerk user.
export const GLOBAL_USER = "global";

/**
 * Resolve the owning account for a user-scoped setting. The authenticated user
 * id is forwarded by middleware as the `x-bridge-user-id` header (see
 * src/middleware.ts); we fall back to the shared "global" owner when no user is
 * available so reads/writes still work under the dev bypass and in tests.
 */
export async function resolveUserId(): Promise<string> {
  try {
    const requestHeaders = await headers();
    return requestHeaders.get(USER_HEADER) ?? GLOBAL_USER;
  } catch {
    return GLOBAL_USER;
  }
}

/** Read a raw per-account setting value, or null when unset. */
export async function readUserSetting(key: string, userId: string): Promise<string | null> {
  const row = await db.query.userSetting.findFirst({
    where: (r, { and: andFn, eq: eqFn }) => andFn(eqFn(r.userId, userId), eqFn(r.key, key)),
  });
  return row?.value ?? null;
}

/** Upsert a raw per-account setting value. */
export async function writeUserSetting(key: string, userId: string, value: string): Promise<void> {
  await db
    .insert(userSetting)
    .values({ userId, key, value })
    .onConflictDoUpdate({
      target: [userSetting.userId, userSetting.key],
      set: { value },
    })
    .run();
}

/**
 * Seed-on-read migration from the shared global `appSetting` table to per-account
 * `userSetting` (BRDG-343). Returns the user's own value if it exists; otherwise
 * falls back to the legacy global `appSetting` row, seeds the user's copy with it
 * once, and returns that. The global row is never mutated, so every account can
 * still seed from it on first read; once a user writes their own value it
 * permanently shadows the global seed (presence of the row IS the idempotency
 * flag). Returns null when neither a per-account nor a global value exists.
 */
export async function seedUserSettingFromGlobal(
  key: string,
  userId: string,
): Promise<string | null> {
  const existing = await readUserSetting(key, userId);
  if (existing !== null) return existing;

  const legacy = await db.query.appSetting.findFirst({
    where: (r, { eq: eqFn }) => eqFn(r.key, key),
  });
  if (legacy?.value == null) return null;

  await writeUserSetting(key, userId, legacy.value);
  return legacy.value;
}

/**
 * Build GET/PUT handlers for a per-account JSON setting, so a new account-scoped
 * setting is a few lines (BRDG-343). The setting is stored as a JSON blob keyed
 * on the authenticated user and exchanged under a `{ value }` envelope. The
 * default is returned when the user has never written the setting.
 */
export function createUserJsonSettingRoute<S extends z.ZodTypeAny>(
  key: string,
  valueSchema: S,
  defaultValue: z.infer<S>,
) {
  async function GET() {
    try {
      const userId = await resolveUserId();
      const raw = await readUserSetting(key, userId);
      const value = raw === null ? defaultValue : (JSON.parse(raw) as z.infer<S>);
      return NextResponse.json({ value }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch {
      return NextResponse.json({ value: defaultValue }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
  }

  const bodySchema = z.object({ value: valueSchema });

  async function PUT(request: Request) {
    const limited = await applyRateLimit("write");
    if (limited) return limited;

    try {
      const parsed = await parseJsonBody(request, bodySchema);
      if ("error" in parsed) return parsed.error;
      const value = (parsed.data as { value: z.infer<S> }).value;
      const userId = await resolveUserId();
      await writeUserSetting(key, userId, JSON.stringify(value));
      return NextResponse.json({ value });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error("settings", `Failed to save user setting "${key}"`, message);
      return errorResponse("Failed to save setting", 500);
    }
  }

  return { GET, PUT };
}
