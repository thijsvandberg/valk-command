import { NextResponse } from "next/server";
import { cache } from "@/lib/cache";

export async function GET() {
  return NextResponse.json(cache.stats());
}
