import { NextResponse } from "next/server";
import { cache } from "@/lib/cache";

export async function POST() {
  cache.flush();
  return NextResponse.json({ ok: true });
}
