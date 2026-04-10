import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const COOKIE_NAME = "bridge_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds
const PASSWORD_HASH_KEY = "auth_password_hash";

async function getJwtSecret(): Promise<Uint8Array> {
  let secret = env.JWT_SECRET;
  if (!secret) {
    // Auto-generate and persist a secret if not set
    const row = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, "jwt_secret"),
    });
    if (row) {
      secret = row.value;
    } else {
      secret = randomBytes(32).toString("hex");
      await db.insert(appSetting)
        .values({ key: "jwt_secret", value: secret });
    }
  }
  return new TextEncoder().encode(secret);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return timingSafeEqual(candidate, expected);
}

export async function createSession(): Promise<string> {
  const secret = await getJwtSecret();
  const token = await new SignJWT({ sub: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret);
  return token;
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    const secret = await getJwtSecret();
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionToken(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(COOKIE_NAME)?.value;
}

export async function isPasswordSet(): Promise<boolean> {
  const row = await db.query.appSetting.findFirst({
    where: (r, { eq: eqFn }) => eqFn(r.key, PASSWORD_HASH_KEY),
  });
  return Boolean(row?.value);
}

export async function getPasswordHash(): Promise<string | null> {
  const row = await db.query.appSetting.findFirst({
    where: (r, { eq: eqFn }) => eqFn(r.key, PASSWORD_HASH_KEY),
  });
  return row?.value ?? null;
}

export async function setPasswordHash(hash: string): Promise<void> {
  const existing = await db.query.appSetting.findFirst({
    where: (r, { eq: eqFn }) => eqFn(r.key, PASSWORD_HASH_KEY),
  });
  if (existing) {
    await db.update(appSetting)
      .set({ value: hash })
      .where(eq(appSetting.key, PASSWORD_HASH_KEY));
  } else {
    await db.insert(appSetting)
      .values({ key: PASSWORD_HASH_KEY, value: hash });
  }
}

export { COOKIE_NAME };
