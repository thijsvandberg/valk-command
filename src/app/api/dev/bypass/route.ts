import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Dev-only endpoint for local development bypass.
// GET  /api/dev/bypass  — sets the dev_bypass cookie and redirects to /
// DELETE /api/dev/bypass — clears the cookie (called by logout)
//
// In production this always returns 404.

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") return notFound();
  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set("dev_bypass", "1", { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}

export function DELETE() {
  if (process.env.NODE_ENV !== "development") return notFound();
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("dev_bypass");
  return res;
}
