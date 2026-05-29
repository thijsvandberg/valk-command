import { NextResponse } from "next/server";
import { db } from "@/db";
import { stakeholderAnalysis, message } from "@/db/schema";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { createNotification } from "@/lib/notifications";
import { parseBriefingOutput } from "@/lib/stakeholder-data";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";
import { nextSequence } from "@/db/next-sequence";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const b = parsed.data as Record<string, unknown>;
  const status = b.status === "completed" || b.status === "failed" ? b.status : null;
  if (!status) {
    return errorResponse("status must be 'completed' or 'failed'", 400);
  }

  const row = await db.query.stakeholderAnalysis.findFirst({
    where: (r, { eq }) => eq(r.id, id),
  });
  if (!row) {
    return errorResponse("Analysis not found", 404);
  }

  if (status === "completed") {
    const rawOutput = typeof b.output === "string" ? b.output : "";
    const { narrative, risks } = parseBriefingOutput(rawOutput);

    await db
      .update(stakeholderAnalysis)
      .set({
        status: "completed",
        content: rawOutput,
        narrative,
        risks: JSON.stringify(risks),
        completedAt: new Date().toISOString(),
      })
      .where(eq(stakeholderAnalysis.id, id));

    // Post assistant message to conversation
    if (row.conversationId) {
      await db.insert(message).values({
        id: randomUUID(),
        conversationId: row.conversationId,
        role: "assistant",
        content: rawOutput,
        timestamp: new Date().toISOString(),
        workspaceTaskId: row.workspaceTaskId ?? undefined,
        status: "sent",
        sequence: nextSequence(row.conversationId),
      });

      const typeLabel = row.type === "brief" ? "Sprint Brief" : "Deep Dive";
      const teamMatch = row.sprintName.match(/^([A-Z]+)[: ]/);
      const teamParam = teamMatch ? `&team=${teamMatch[1]}` : "";
      createNotification(
        "stakeholder-analysis",
        `${typeLabel} ready for ${row.sprintName}`,
        {
          category: "agent",
          linkUrl: `/stakeholder?sprintId=${row.sprintId}${teamParam}`,
        },
      );
    }
  } else {
    await db
      .update(stakeholderAnalysis)
      .set({
        status: "failed",
        completedAt: new Date().toISOString(),
      })
      .where(eq(stakeholderAnalysis.id, id));
  }

  const updated = await db.query.stakeholderAnalysis.findFirst({
    where: (r, { eq }) => eq(r.id, id),
  });
  return NextResponse.json(updated);
}
