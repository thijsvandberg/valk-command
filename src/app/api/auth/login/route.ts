import { NextResponse } from "next/server";
import {
  verifyPassword,
  getPasswordHash,
  createSession,
  setSessionCookie,
} from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password = body?.password;

  if (!password || typeof password !== "string") {
    return NextResponse.json(
      { error: "Password is required" },
      { status: 400 },
    );
  }

  const hash = await getPasswordHash();
  if (!hash) {
    return NextResponse.json(
      { error: "No password configured. Please complete setup first." },
      { status: 400 },
    );
  }

  if (!verifyPassword(password, hash)) {
    return NextResponse.json(
      { error: "Invalid password" },
      { status: 401 },
    );
  }

  const token = await createSession();
  await setSessionCookie(token);

  return NextResponse.json({ success: true });
}
