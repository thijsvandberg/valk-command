/**
 * Parsers for the break-down-epic VRW skill output. The skill is phase-aware and
 * emits tagged blocks; Bridge parses them into session state and child cards.
 * Parsing is deliberately defensive: malformed or partial AI output must never
 * throw, only yield nothing, so a bad turn degrades to "no change" rather than a
 * 500 (see the AI-output-parsing risk in the plan).
 */

export interface ParsedChildCard {
  title: string;
  bullets: string[];
  body: string | null;
  suggestedSprintId: string | null;
  suggestedLinks: { targetIndex: number; relation: string; confirmed: boolean }[];
}

/**
 * Extracts the discovery-phase questions block. The skill emits a markdown
 * bullet list inside <epic-questions>; we return the trimmed inner text so the
 * chat surface can render it as-is. Returns null when the block is absent.
 */
export function extractEpicQuestions(output: string): string | null {
  const match = output.match(/<epic-questions>([\s\S]*?)<\/epic-questions>/);
  if (!match) return null;
  const inner = match[1].trim();
  return inner.length > 0 ? inner : null;
}

const VALID_RELATIONS = new Set([
  "relates to",
  "blocks",
  "is blocked by",
  "clones",
  "is cloned by",
  "duplicates",
  "is duplicated by",
]);

function normalizeBullets(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b): b is string => typeof b === "string")
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

function normalizeLinks(
  raw: unknown,
): { targetIndex: number; relation: string; confirmed: boolean }[] {
  if (!Array.isArray(raw)) return [];
  const links: { targetIndex: number; relation: string; confirmed: boolean }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const targetIndex = obj.targetIndex;
    const relation = obj.relation;
    if (typeof targetIndex !== "number" || !Number.isInteger(targetIndex) || targetIndex < 0) continue;
    if (typeof relation !== "string" || !VALID_RELATIONS.has(relation)) continue;
    // AI suggestions always start unconfirmed; the PO confirms each link later.
    links.push({ targetIndex, relation, confirmed: false });
  }
  return links;
}

function normalizeSprintId(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  return null;
}

/**
 * Extracts the breakdown/refine-phase child-story cards. The skill emits a JSON
 * array of cards inside <epic-breakdown>; the full set is returned each turn, so
 * the parsed array replaces the existing cards wholesale. Cards without a usable
 * title are dropped. Returns null when the block is absent or its JSON is
 * unparseable (so the caller leaves existing cards untouched), and an empty array
 * only when the block is present but contains no valid cards.
 */
export function extractEpicBreakdown(output: string): ParsedChildCard[] | null {
  const match = output.match(/<epic-breakdown>([\s\S]*?)<\/epic-breakdown>/);
  if (!match) return null;

  const inner = match[1].trim();
  if (!inner) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(inner);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) return null;

  const cards: ParsedChildCard[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    if (!title) continue;
    cards.push({
      title,
      bullets: normalizeBullets(obj.bullets),
      body: typeof obj.body === "string" && obj.body.trim().length > 0 ? obj.body : null,
      suggestedSprintId: normalizeSprintId(obj.suggestedSprintId),
      suggestedLinks: normalizeLinks(obj.suggestedLinks),
    });
  }

  return cards;
}

/**
 * A worked-out story body keyed by the card index it details. The detail phase
 * deepens individual cards, so the skill emits one <story-detail index="N">
 * block per deepened card (full description + acceptance criteria as markdown).
 */
export interface ParsedStoryDetail {
  index: number;
  body: string;
}

/**
 * Extracts the detail-phase <story-detail> blocks. Each block names the card it
 * deepens via an index attribute and carries the full body (description + AC) as
 * its inner markdown. Several blocks can appear in one turn when the PO deepens
 * multiple cards in parallel. Unlike <epic-breakdown>, these are merged onto the
 * existing cards by index rather than replacing the set.
 *
 * Parsing is defensive: a block without a parseable non-negative integer index,
 * or with empty inner content, is dropped. Returns null when no block is present
 * (so the caller leaves bodies untouched) and an empty array when blocks are
 * present but none are usable. Duplicate indexes: the last one wins.
 */
export function extractStoryDetails(output: string): ParsedStoryDetail[] | null {
  const regex = /<story-detail\b([^>]*)>([\s\S]*?)<\/story-detail>/g;
  let match: RegExpExecArray | null;
  let sawAny = false;
  const byIndex = new Map<number, string>();

  while ((match = regex.exec(output)) !== null) {
    sawAny = true;
    const attrs = match[1];
    const inner = match[2].trim();
    if (!inner) continue;

    const indexMatch = attrs.match(/\bindex\s*=\s*"(\d+)"/);
    if (!indexMatch) continue;
    const index = Number.parseInt(indexMatch[1], 10);
    if (!Number.isInteger(index) || index < 0) continue;

    // Last block for an index wins, so a re-emitted detail supersedes earlier.
    byIndex.set(index, inner);
  }

  if (!sawAny) return null;
  return [...byIndex.entries()].map(([index, body]) => ({ index, body }));
}

/**
 * A proposed sprint placement for one card, keyed by the card index it applies
 * to. The sprint-planning phase suggests where each story should go; the PO
 * confirms before anything moves (the suggestion only pre-fills the placement
 * menu, it never assigns a sprint on its own).
 */
export interface ParsedSprintPlanEntry {
  index: number;
  sprintId: string;
}

/**
 * Extracts the sprint-planning <sprint-plan> block. The skill emits a JSON array
 * of { index, sprintId } entries inside the block; index names the card and
 * sprintId is the proposed sprint (a numeric id, or "__backlog__" for the
 * backlog). Defensive like the other parsers: returns null when the block is
 * absent or its JSON is unparseable (caller leaves suggestions untouched), and
 * an empty array when present but containing no usable entries. Entries without
 * a non-negative integer index or a usable sprint id are dropped; duplicate
 * indexes keep the last entry.
 */
export function extractSprintPlan(output: string): ParsedSprintPlanEntry[] | null {
  const match = output.match(/<sprint-plan>([\s\S]*?)<\/sprint-plan>/);
  if (!match) return null;

  const inner = match[1].trim();
  if (!inner) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(inner);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) return null;

  const byIndex = new Map<number, string>();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const index = obj.index;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0) continue;
    const sprintId = normalizeSprintId(obj.sprintId);
    // Allow the explicit backlog marker through verbatim alongside numeric ids.
    const value = sprintId ?? (obj.sprintId === "__backlog__" ? "__backlog__" : null);
    if (!value) continue;
    byIndex.set(index, value);
  }

  return [...byIndex.entries()].map(([index, sprintId]) => ({ index, sprintId }));
}
