import { NextResponse } from "next/server";
import Fuse, { type IFuseOptions, type FuseResultMatch } from "fuse.js";
import { db } from "@/db";
import { ticket, ticketMetadata, jiraComment, poComment, ticketLocalEdit, appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";
import { adfToMarkdown } from "@/lib/adf-to-markdown";

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
  matches: readonly FuseResultMatch[] | undefined;
}

// Flat document fed to Fuse.js for a single ticket
interface SearchDoc {
  key: string;
  summary: string;
  status: string;
  priority: string | null;
  assignee: string | null;
  reporter: string | null;
  sprintName: string | null;
  labels: string;
  description: string;
  localEditTitle: string;
  localEditDescription: string;
  notes: string;
  tags: string;
  jiraCommentBodies: string;
  poCommentBodies: string;
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

const FUSE_OPTIONS: IFuseOptions<SearchDoc> = {
  threshold: 0.4,
  // Without ignoreLocation, Fuse only matches within the first ~100 chars of a
  // string, silently missing matches deep in description/comment bodies.
  ignoreLocation: true,
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
  keys: [
    { name: "key", weight: 1.0 },
    { name: "summary", weight: 0.85 },
    { name: "localEditTitle", weight: 0.8 },
    { name: "assignee", weight: 0.8 },
    { name: "labels", weight: 0.6 },
    { name: "notes", weight: 0.55 },
    { name: "tags", weight: 0.5 },
    { name: "description", weight: 0.45 },
    { name: "localEditDescription", weight: 0.45 },
    { name: "reporter", weight: 0.35 },
    { name: "poCommentBodies", weight: 0.25 },
    { name: "status", weight: 0.2 },
    { name: "priority", weight: 0.2 },
    { name: "jiraCommentBodies", weight: 0.15 },
  ],
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";

  if (q.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    // Load all tickets
    const tickets = await db.select().from(ticket).all();
    const metadataRows = await db.select().from(ticketMetadata).all();
    const jiraCommentRows = await db.select().from(jiraComment).all();
    const poCommentRows = await db.select().from(poComment).all();
    const localEditRows = await db.select().from(ticketLocalEdit).all();

    // Build sprint ID → display name map from cached Jira sprint list
    const sprintSetting = await db.select().from(appSetting).where(eq(appSetting.key, "jira_sprints")).get();
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

    // Index by ticket key for O(1) lookup
    const metaByKey = new Map(metadataRows.map((m) => [m.jiraKey, m]));

    // Group comments by ticket key
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

    // Group local edits by ticket key and field
    const localEditsByKey = new Map<string, { title?: string; description?: string }>();
    for (const e of localEditRows) {
      const existing = localEditsByKey.get(e.ticketKey) ?? {};
      if (e.field === "title") existing.title = e.localValue;
      else if (e.field === "description") existing.description = e.localValue;
      localEditsByKey.set(e.ticketKey, existing);
    }

    // Build flat search documents
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
        // Metadata has no tags field — use labels as fallback
        tags: t.labels ?? "",
        jiraCommentBodies: (jiraCommentsByKey.get(t.jiraKey) ?? []).join(" "),
        poCommentBodies: (poCommentsByKey.get(t.jiraKey) ?? []).join(" "),
      };
    });

    const fuse = new Fuse(docs, FUSE_OPTIONS);
    const tokens = q.trim().split(/\s+/).filter((t) => t.length >= 2);

    // For multi-word queries, run a per-token search and boost documents that
    // match ALL tokens (possibly across different fields, e.g. "age" in title
    // and "david" in assignee). This is more reliable than Fuse's built-in
    // extended search AND, which can miss cross-field combinations.
    const fuseResults = fuse.search(tokens[0] ?? q, { limit: 200 });

    if (tokens.length > 1) {
      const additionalMaps = tokens.slice(1).map((token) => {
        const f = new Fuse(docs, FUSE_OPTIONS);
        return new Map(f.search(token, { limit: 200 }).map((r) => [r.item.key, r.score ?? 1]));
      });

      for (const r of fuseResults) {
        const matchingTokenCount = additionalMaps.filter((m) => m.has(r.item.key)).length;
        if (matchingTokenCount === additionalMaps.length) {
          // Every token matched — compute average score across all tokens and apply strong boost
          const otherAvg = additionalMaps.reduce((sum, m) => sum + (m.get(r.item.key) ?? 1), 0) / additionalMaps.length;
          r.score = ((r.score ?? 1) + otherAvg) / 2 * 0.55;
        } else if (matchingTokenCount > 0) {
          // Only some tokens matched — mild boost
          r.score = (r.score ?? 1) * 0.85;
        }
        // Zero extra token matches: score unchanged, will likely fall behind boosted results
      }

      fuseResults.sort((a, b) => (a.score ?? 1) - (b.score ?? 1));
    }

    const jiraBaseUrl = process.env.JIRA_BASE_URL ?? "";
    const ticketsByKey = new Map(tickets.map((t) => [t.jiraKey, t]));

    // Determine active sprint IDs: highest numeric sprint IDs are most likely active/recent.
    const sortedSprintIds = [...sprintIdToName.keys()].sort((a, b) => parseInt(b) - parseInt(a));
    const activeSprintIds = new Set(sortedSprintIds.slice(0, 2));

    const now = Date.now();

    const results: LocalSearchResult[] = fuseResults
      .map((r) => {
        const t = ticketsByKey.get(r.item.key);
        let score = r.score ?? 1;

        // Recency boost: recently updated tickets rank higher
        if (t?.jiraUpdatedAt) {
          const daysSince = (now - new Date(t.jiraUpdatedAt).getTime()) / 86400000;
          if (daysSince < 7) score *= 0.82;
          else if (daysSince < 30) score *= 0.90;
          else if (daysSince > 180) score *= 1.06;
        }

        // Active sprint boost: tickets in the two most recent sprints rank higher
        if (r.item.sprintName && activeSprintIds.has(r.item.sprintName)) {
          score *= 0.88;
        }

        return {
          key: r.item.key,
          summary: r.item.localEditTitle || r.item.summary,
          status: r.item.status,
          issueType: t?.type ?? null,
          assignee: r.item.assignee,
          sprintId: r.item.sprintName ?? null,
          sprintName: r.item.sprintName
            ? (sprintIdToName.get(r.item.sprintName) ?? r.item.sprintName)
            : null,
          labels: r.item.labels || null,
          epic: t?.epic ?? null,
          epicKey: t?.epicKey ?? null,
          description: r.item.description || null,
          jiraUrl: jiraBaseUrl ? `${jiraBaseUrl}/browse/${r.item.key}` : null,
          storyPoints: t?.storyPoints ?? null,
          reporter: r.item.reporter,
          updatedAt: t?.jiraUpdatedAt ?? null,
          score,
          matches: r.matches,
        };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 25);

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[search/local GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
