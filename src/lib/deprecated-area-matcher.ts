/**
 * Pure keyword matcher for the "replaced / obsolete area" deep-scan topic
 * (BRDG-285, see docs/plans/2026-06-04-backlog-deprecation-review-epic.md).
 *
 * Given a ticket's text fields and the editable deprecated-area list, it reports
 * which retired areas the ticket mentions and a base 0..1 score. The score is a
 * cheap prior; the topic scorer then asks the agent to confirm the mention is
 * substantive (not incidental) before promoting it. Keeping this a pure function
 * makes it trivially unit-testable without a DB or agent.
 */

/** One row of the editable deprecated-area list, as the matcher needs it. */
export interface DeprecatedArea {
  /** Canonical term, e.g. "RezExchange". */
  term: string;
  /** Alternate spellings/acronyms, comma-separated, e.g. "Rez Exchange". */
  aliases?: string | null;
}

/** The ticket text fields the matcher scans. */
export interface MatchableTicket {
  title: string;
  description?: string | null;
  labels?: string | null;
  components?: string | null;
}

/** A single matched area with the concrete terms that hit and where. */
export interface AreaMatch {
  /** Canonical term of the matched area. */
  term: string;
  /** The actual surface forms (term/aliases) that matched, lowercased. */
  matchedTerms: string[];
  /** Field names where at least one hit landed (title weighs more downstream). */
  fields: string[];
}

export interface MatchResult {
  /** Base likelihood (0..1) from keyword matching alone, pre AI confirmation. */
  baseScore: number;
  /** Every deprecated area the ticket mentions. Empty => no match (abstain). */
  matches: AreaMatch[];
}

// A term shorter than this is only matched as a standalone token (never as a
// fragment), and we additionally require it to look like an acronym/identifier.
// WHY: very short terms like "CWI" are prone to incidental collisions, so we
// lean on word boundaries hard and let the AI confirmation step do the rest.
const SHORT_TERM_MAX_LEN = 4;

/** Split a comma/semicolon separated alias string into trimmed, non-empty parts. */
function splitAliases(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
}

/** Escape a user-supplied term so it is safe to embed in a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a case-insensitive, word-boundary matcher for one surface form.
 *
 * `\b` does not fire next to non-word characters, so multi-word terms such as
 * "hybrid cloud" still match around the internal space; we anchor on word
 * boundaries at the outer edges only. This rejects substring false hits (e.g.
 * "cwi" inside "scwint") while allowing punctuation-adjacent real mentions.
 */
function buildPattern(surface: string): RegExp {
  const escaped = escapeRegExp(surface.trim());
  return new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?:$|[^A-Za-z0-9])`, "i");
}

function fieldMatches(haystack: string | null | undefined, surface: string): boolean {
  if (!haystack) return false;
  return buildPattern(surface).test(haystack);
}

/**
 * Match a ticket against the deprecated-area list.
 *
 * Scoring rationale: a hit in the title is a strong obsolescence signal, a hit
 * only in body/labels/components is weaker (more likely incidental). The base
 * score reflects that, capped at 0.85 so keyword matching alone never reaches
 * full confidence without the AI confirmation step adding the rest.
 */
export function matchDeprecatedAreas(
  ticket: MatchableTicket,
  areas: DeprecatedArea[],
): MatchResult {
  const matches: AreaMatch[] = [];

  for (const area of areas) {
    const surfaces = [area.term, ...splitAliases(area.aliases)]
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (surfaces.length === 0) continue;

    const matchedTerms = new Set<string>();
    const fields = new Set<string>();

    for (const surface of surfaces) {
      // For short terms, require it to be a token-like identifier (letters/digits
      // only) so we never match arbitrary short substrings of normal prose.
      if (surface.length <= SHORT_TERM_MAX_LEN && !/^[A-Za-z0-9]+$/.test(surface)) {
        continue;
      }
      const hitFields: Array<[string, string | null | undefined]> = [
        ["title", ticket.title],
        ["description", ticket.description],
        ["labels", ticket.labels],
        ["components", ticket.components],
      ];
      for (const [field, value] of hitFields) {
        if (fieldMatches(value, surface)) {
          matchedTerms.add(surface.toLowerCase());
          fields.add(field);
        }
      }
    }

    if (matchedTerms.size > 0) {
      matches.push({
        term: area.term,
        matchedTerms: [...matchedTerms],
        fields: [...fields],
      });
    }
  }

  if (matches.length === 0) {
    return { baseScore: 0, matches: [] };
  }

  const hitTitle = matches.some((m) => m.fields.includes("title"));
  // Title hit => strong prior; body-only hit => weaker prior. A second matched
  // area nudges it up a little (corroboration) but stays under the 0.85 cap.
  let baseScore = hitTitle ? 0.7 : 0.5;
  if (matches.length > 1) baseScore += 0.1;
  baseScore = Math.min(0.85, baseScore);

  return { baseScore, matches };
}
