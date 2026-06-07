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
