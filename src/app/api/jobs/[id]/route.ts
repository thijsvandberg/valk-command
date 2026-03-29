import { NextResponse } from "next/server";
import { db } from "@/db";
import { scheduledJob } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isValidCron } from "@/lib/cron";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const job = await db.query.scheduledJob.findFirst({
    where: (j, { eq }) => eq(j.id, id),
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const job = await db.query.scheduledJob.findFirst({
    where: (j, { eq }) => eq(j.id, id),
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updates: Partial<typeof job> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim() === "") {
      return NextResponse.json(
        { error: "name must be a non-empty string" },
        { status: 400 },
      );
    }
    updates.name = body.name.trim();
  }

  if (body.cronExpression !== undefined) {
    if (typeof body.cronExpression !== "string" || body.cronExpression.trim() === "") {
      return NextResponse.json(
        { error: "cronExpression must be a non-empty string" },
        { status: 400 },
      );
    }
    if (!isValidCron(body.cronExpression)) {
      return NextResponse.json(
        { error: "cronExpression must be a valid 5-field cron expression" },
        { status: 400 },
      );
    }
    updates.cronExpression = body.cronExpression.trim();
  }

  if (body.skillName !== undefined) {
    if (typeof body.skillName !== "string" || body.skillName.trim() === "") {
      return NextResponse.json(
        { error: "skillName must be a non-empty string" },
        { status: 400 },
      );
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
  const { id } = await params;

  const job = await db.query.scheduledJob.findFirst({
    where: (j, { eq }) => eq(j.id, id),
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  await db.delete(scheduledJob).where(eq(scheduledJob.id, id));

  return new NextResponse(null, { status: 204 });
}
