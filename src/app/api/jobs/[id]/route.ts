import { NextResponse } from "next/server";
import { db } from "@/db";
import { scheduledJob } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isValidCron } from "@/lib/cron";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const job = await db.query.scheduledJob.findFirst({
    where: (j, { eq }) => eq(j.id, id),
  });

  if (!job) {
    return errorResponse("Job not found", 404);
  }

  return NextResponse.json(job);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const job = await db.query.scheduledJob.findFirst({
    where: (j, { eq }) => eq(j.id, id),
  });

  if (!job) {
    return errorResponse("Job not found", 404);
  }

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const updates: Partial<typeof job> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim() === "") {
      return errorResponse("name must be a non-empty string", 400);
    }
    updates.name = body.name.trim();
  }

  if (body.cronExpression !== undefined) {
    if (typeof body.cronExpression !== "string" || body.cronExpression.trim() === "") {
      return errorResponse("cronExpression must be a non-empty string", 400);
    }
    if (!isValidCron(body.cronExpression)) {
      return errorResponse("cronExpression must be a valid 5-field cron expression", 400);
    }
    updates.cronExpression = body.cronExpression.trim();
  }

  if (body.skillName !== undefined) {
    if (typeof body.skillName !== "string" || body.skillName.trim() === "") {
      return errorResponse("skillName must be a non-empty string", 400);
    }
    updates.skillName = body.skillName.trim();
  }

  if (body.enabled !== undefined) {
    updates.enabled = Boolean(body.enabled);
  }

  await db.update(scheduledJob).set(updates).where(eq(scheduledJob.id, id));

  const updated = await db.query.scheduledJob.findFirst({
    where: (j, { eq }) => eq(j.id, id),
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit("delete");
  if (limited) return limited;

  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const job = await db.query.scheduledJob.findFirst({
    where: (j, { eq }) => eq(j.id, id),
  });

  if (!job) {
    return errorResponse("Job not found", 404);
  }

  await db.delete(scheduledJob).where(eq(scheduledJob.id, id));

  return new NextResponse(null, { status: 204 });
}
