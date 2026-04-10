import { NextResponse } from "next/server";
import {
  isPasswordSet,
  hashPassword,
  setPasswordHash,
  createSession,
  setSessionCookie,
} from "@/lib/auth";

export async function GET() {
  return NextResponse.json({ needsSetup: !(await isPasswordSet()) });
}

export async function POST(request: Request) {
  if (await isPasswordSet()) {
    return NextResponse.json(
      { error: "Password already configured" },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  const password = body?.password;

  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 },
    );
  }

  const hash = hashPassword(password);
  await setPasswordHash(hash);

  const token = await createSession();
  await setSessionCookie(token);

  return NextResponse.json({ success: true });
}
