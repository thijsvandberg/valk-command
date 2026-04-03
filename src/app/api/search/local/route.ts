import { NextResponse } from "next/server";
import Fuse, { type IFuseOptions, type FuseResultMatch } from "fuse.js";
import { db } from "@/db";
import { ticket, ticketMetadata, jiraComment, poComment, ticketLocalEdit } from "@/db/schema";
import { adfToMarkdown } from "@/lib/adf-to-markdown";

export interface LocalSearchResult {
  key: string;
  summary: string;
  status: string;
  priority: string | null;
  assignee: string | null;
  sprintName: string | null;
  labels: string | null;
  descriptionPreview: string | null;
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
  threshold: 0.35,
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
  keys: [
    { name: "key", weight: 1.0 },
    { name: "summary", weight: 0.8 },
    { name: "localEditTitle", weight: 0.7 },
    { name: "tags", weight: 0.5 },
    { name: "labels", weight: 0.5 },
    { name: "notes", weight: 0.5 },
    { name: "poCommentBodies", weight: 0.2 },
    { name: "assignee", weight: 0.3 },
    { name: "reporter", weight: 0.3 },
    { name: "status", weight: 0.2 },
    { name: "priority", weight: 0.2 },
    { name: "description", weight: 0.15 },
    { name: "localEditDescription", weight: 0.15 },
    { name: "jiraCommentBodies", weight: 0.1 },
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
    const fuseResults = fuse.search(q, { limit: 25 });

    const results: LocalSearchResult[] = fuseResults.map((r) => ({
      key: r.item.key,
      summary: r.item.localEditTitle || r.item.summary,
      status: r.item.status,
      priority: r.item.priority,
      assignee: r.item.assignee,
      sprintName: r.item.sprintName,
      labels: r.item.labels || null,
      descriptionPreview: r.item.description
        ? r.item.description.slice(0, 250).trim() || null
        : null,
      score: r.score ?? 1,
      matches: r.matches,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[search/local GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
