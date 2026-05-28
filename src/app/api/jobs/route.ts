import { NextResponse } from "next/server";
import { db } from "@/db";
import { scheduledJob } from "@/db/schema";
import { randomUUID } from "crypto";
import { isValidCron } from "@/lib/cron";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

export async function GET() {
  const result = await db.select().from(scheduledJob).limit(100);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  if (typeof body.name !== "string" || body.name.trim() === "") {
    return errorResponse("name is required and must be a non-empty string", 400);
  }

  if (typeof body.cronExpression !== "string" || body.cronExpression.trim() === "") {
    return errorResponse("cronExpression is required and must be a non-empty string", 400);
  }

  if (!isValidCron(body.cronExpression)) {
    return errorResponse("cronExpression must be a valid 5-field cron expression", 400);
  }

  if (typeof body.skillName !== "string" || body.skillName.trim() === "") {
    return errorResponse("skillName is required and must be a non-empty string", 400);
  }

  const id = randomUUID();
  const job = {
    id,
    name: (body.name as string).trim(),
    cronExpression: (body.cronExpression as string).trim(),
    skillName: (body.skillName as string).trim(),
    enabled: (body.enabled as boolean | undefined) ?? true,
    lastRunAt: null,
    lastResultSummary: null,
  };

  await db.insert(scheduledJob).values(job);

  const created = await db.query.scheduledJob.findFirst({
    where: (j, { eq }) => eq(j.id, id),
  });

  return NextResponse.json(created, { status: 201 });
}
