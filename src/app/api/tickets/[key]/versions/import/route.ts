import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { storyVersion } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { createHash } from "crypto";
import { applyRateLimit } from "@/lib/rate-limiter";

function contentHash(description: string): string {
  const text = `${JSON.stringify(description)}|`;
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  if (!jiraClient.isLive) {
    return NextResponse.json(
      { error: "Jira is not configured" },
      { status: 503 },
    );
  }

  const changelog = await jiraClient.getDescriptionChangelog(key);

  if (changelog.length === 0) {
    return NextResponse.json({ imported: 0, skipped: 0, total: 0 });
  }

  // Fetch existing content hashes for this ticket to deduplicate
  const existingVersions = await db
    .select({ contentHash: storyVersion.contentHash })
    .from(storyVersion)
    .where(eq(storyVersion.jiraKey, key));
  const existingHashes = new Set(existingVersions.map((v) => v.contentHash));

  let imported = 0;
  let skipped = 0;

  db.transaction((tx) => {
    for (const change of changelog) {
      const hash = contentHash(change.description);

      if (existingHashes.has(hash)) {
        skipped++;
        continue;
      }

      // Prevent inserting duplicate hashes from multiple changelog entries
      existingHashes.add(hash);

      tx.insert(storyVersion)
        .values({
          id: `sv-${key}-import-${Date.now()}-${imported}`,
          jiraKey: key,
          description: change.description,
          acceptanceCriteria: null,
          contentHash: hash,
          updatedBy: change.author,
          updatedByAvatar: change.avatar,
          createdAt: change.created,
        })
        .run();

      imported++;
    }
  });

  return NextResponse.json({
    imported,
    skipped,
    total: changelog.length,
  });
}
