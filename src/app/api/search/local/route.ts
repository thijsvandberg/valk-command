import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata, jiraComment, poComment, ticketLocalEdit, appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";
import { adfToMarkdown } from "@/lib/adf-to-markdown";
import { getSearchCache, setSearchCache, type SearchDoc, type TicketDetail, type FuseResultMatchType } from "@/lib/search-index-cache";

export interface LocalSearchResult {
  key: string;
  summary: string;
  status: string;
  issueType: string | null;
  assignee: string | null;
  sprintId: string | null;
  sprintName: string | null;
  labels: string | null;
  epic: string | null;
  epicKey: string | null;
  description: string | null;
  jiraUrl: string | null;
  storyPoints: number | null;
  reporter: string | null;
  updatedAt: string | null;
  score: number;
  matches: readonly FuseResultMatchType[] | undefined;
}

// Parse ADF JSON string or return plain text if already a string
function stripAdf(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return adfToMarkdown(parsed);
    }
  } catch {
    // Not JSON — treat as plain text
  }
  return raw;
}

async function buildIndex() {
  const [tickets, metadataRows, jiraCommentRows, poCommentRows, localEditRows, sprintSetting] =
    await Promise.all([
      db.select().from(ticket).all(),
      db.select().from(ticketMetadata).all(),
      db.select().from(jiraComment).all(),
      db.select().from(poComment).all(),
      db.select().from(ticketLocalEdit).all(),
      db.select().from(appSetting).where(eq(appSetting.key, "jira_sprints")).get(),
    ]);

  const sprintIdToName = new Map<string, string>();
  if (sprintSetting) {
    try {
      const parsed = JSON.parse(sprintSetting.value) as { id: number; name: string }[];
      for (const s of parsed) {
        sprintIdToName.set(String(s.id), s.name);
      }
    } catch {
      // Malformed cache — skip name resolution
    }
  }

  const metaByKey = new Map(metadataRows.map((m) => [m.jiraKey, m]));

  const jiraCommentsByKey = new Map<string, string[]>();
  for (const c of jiraCommentRows) {
    const existing = jiraCommentsByKey.get(c.ticketKey) ?? [];
    existing.push(stripAdf(c.content));
    jiraCommentsByKey.set(c.ticketKey, existing);
  }

  const poCommentsByKey = new Map<string, string[]>();
  for (const c of poCommentRows) {
    const existing = poCommentsByKey.get(c.ticketKey) ?? [];
    existing.push(c.content);
    poCommentsByKey.set(c.ticketKey, existing);
  }

  const localEditsByKey = new Map<string, { title?: string; description?: string }>();
  for (const e of localEditRows) {
    const existing = localEditsByKey.get(e.ticketKey) ?? {};
    if (e.field === "title") existing.title = e.localValue;
    else if (e.field === "description") existing.description = e.localValue;
    localEditsByKey.set(e.ticketKey, existing);
  }

  const docs: SearchDoc[] = tickets.map((t) => {
    const meta = metaByKey.get(t.jiraKey);
    const localEdits = localEditsByKey.get(t.jiraKey);
    return {
      key: t.jiraKey,
      summary: t.title,
      status: t.status,
      priority: t.priority ?? null,
      assignee: t.assignee ?? null,
      reporter: t.reporter ?? null,
      sprintName: t.sprintName ?? null,
      labels: t.labels ?? "",
      description: stripAdf(t.description),
      localEditTitle: localEdits?.title ?? "",
      localEditDescription: stripAdf(localEdits?.description),
      notes: meta?.poNotes ?? "",
      tags: t.labels ?? "",
      jiraCommentBodies: (jiraCommentsByKey.get(t.jiraKey) ?? []).join(" "),
      poCommentBodies: (poCommentsByKey.get(t.jiraKey) ?? []).join(" "),
    };
  });

  const ticketDetails = new Map<string, TicketDetail>(
    tickets.map((t) => [
      t.jiraKey,
      {
        jiraKey: t.jiraKey,
        type: t.type ?? null,
        epic: t.epic ?? null,
        epicKey: t.epicKey ?? null,
        storyPoints: t.storyPoints ?? null,
        jiraUpdatedAt: t.jiraUpdatedAt ?? null,
      },
    ])
  );

  const jiraBaseUrl = process.env.JIRA_BASE_URL ?? "";
  return setSearchCache(docs, ticketDetails, sprintIdToName, jiraBaseUrl);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";

  if (q.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const entry = getSearchCache() ?? (await buildIndex());
    const { fuse, ticketDetails, sprintIdToName, jiraBaseUrl } = entry;

    const tokens = q.trim().split(/\s+/).filter((t) => t.length >= 2);
    const fuseResults = fuse.search(tokens[0] ?? q, { limit: 200 });

    if (tokens.length > 1) {
      // Reuse the same fuse instance for additional tokens — no extra construction cost
      const additionalMaps = tokens.slice(1).map((token) => {
        return new Map(fuse.search(token, { limit: 200 }).map((r) => [r.item.key, r.score ?? 1]));
      });

      for (const r of fuseResults) {
        const matchingTokenCount = additionalMaps.filter((m) => m.has(r.item.key)).length;
        if (matchingTokenCount === additionalMaps.length) {
          const otherAvg =
            additionalMaps.reduce((sum, m) => sum + (m.get(r.item.key) ?? 1), 0) /
            additionalMaps.length;
          r.score = (((r.score ?? 1) + otherAvg) / 2) * 0.55;
        } else if (matchingTokenCount > 0) {
          r.score = (r.score ?? 1) * 0.85;
        }
      }

      fuseResults.sort((a, b) => (a.score ?? 1) - (b.score ?? 1));
    }

    // Determine active sprint IDs: highest numeric sprint IDs are most likely active/recent.
    const sortedSprintIds = [...sprintIdToName.keys()].sort((a, b) => parseInt(b) - parseInt(a));
    const activeSprintIds = new Set(sortedSprintIds.slice(0, 2));

    const now = Date.now();

    const results: LocalSearchResult[] = fuseResults
      .map((r) => {
        const detail = ticketDetails.get(r.item.key);
        let score = r.score ?? 1;

        if (detail?.jiraUpdatedAt) {
          const daysSince = (now - new Date(detail.jiraUpdatedAt).getTime()) / 86400000;
          if (daysSince < 7) score *= 0.82;
          else if (daysSince < 30) score *= 0.90;
          else if (daysSince > 180) score *= 1.06;
        }

        if (r.item.sprintName && activeSprintIds.has(r.item.sprintName)) {
          score *= 0.70;
        }

        const status = r.item.status?.toUpperCase();
        if (status === "DEPRECATED") {
          score *= 1.5;
        } else if (status === "DONE") {
          score *= 1.15;
        }

        return {
          key: r.item.key,
          summary: r.item.localEditTitle || r.item.summary,
          status: r.item.status,
          issueType: detail?.type ?? null,
          assignee: r.item.assignee,
          sprintId: r.item.sprintName ?? null,
          sprintName: r.item.sprintName
            ? (sprintIdToName.get(r.item.sprintName) ?? r.item.sprintName)
            : null,
          labels: r.item.labels || null,
          epic: detail?.epic ?? null,
          epicKey: detail?.epicKey ?? null,
          description: r.item.description || null,
          jiraUrl: jiraBaseUrl ? `${jiraBaseUrl}/browse/${r.item.key}` : null,
          storyPoints: detail?.storyPoints ?? null,
          reporter: r.item.reporter,
          updatedAt: detail?.jiraUpdatedAt ?? null,
          score,
          matches: r.matches,
        };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 25);

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[search/local GET]", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
