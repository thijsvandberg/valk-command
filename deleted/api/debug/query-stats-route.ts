import { NextResponse } from "next/server";
import { getQueryStats, resetQueryStats } from "@/lib/query-timer";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const stats = getQueryStats();
  return NextResponse.json({
    queries: stats,
    totalQueries: stats.reduce((sum, s) => sum + s.count, 0),
    totalSlowQueries: stats.reduce((sum, s) => sum + s.slowCount, 0),
  });
}

export async function DELETE() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  resetQueryStats();
  return NextResponse.json({ status: "cleared" });
}
