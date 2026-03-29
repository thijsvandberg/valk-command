import { NextResponse } from "next/server";
import { db } from "@/db";
import { scheduledJob } from "@/db/schema";
import { randomUUID } from "crypto";
import { isValidCron } from "@/lib/cron";

export async function GET() {
  const result = await db.select().from(scheduledJob);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.name !== "string" || body.name.trim() === "") {
    return NextResponse.json(
      { error: "name is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  if (typeof body.cronExpression !== "string" || body.cronExpression.trim() === "") {
    return NextResponse.json(
      { error: "cronExpression is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  if (!isValidCron(body.cronExpression)) {
    return NextResponse.json(
      { error: "cronExpression must be a valid 5-field cron expression" },
      { status: 400 },
    );
  }

  if (typeof body.skillName !== "string" || body.skillName.trim() === "") {
    return NextResponse.json(
      { error: "skillName is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  const id = randomUUID();
  const job = {
    id,
    name: body.name.trim(),
    cronExpression: body.cronExpression.trim(),
    skillName: body.skillName.trim(),
    enabled: body.enabled ?? true,
    lastRunAt: null,
    lastResultSummary: null,
  };

  await db.insert(scheduledJob).values(job);

  const created = await db.query.scheduledJob.findFirst({
    where: (j, { eq }) => eq(j.id, id),
  });

  return NextResponse.json(created, { status: 201 });
}
