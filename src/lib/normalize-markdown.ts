// Canonicalizes the blank-line spacing of markdown so that two strings that
// differ ONLY in cosmetic whitespace compare as equal.
//
// WHY: the ticket description round-trips through two different serializers.
// `adfToMarkdown` (Jira ADF -> markdown) emits lists tightly (a single newline
// after a list, no blank line between items), while the TipTap rich editor
// re-serializes to standard CommonMark (a blank line after a list and around
// loose-list items). Editing even a single character re-serializes the whole
// document, so the raw strings diverge on blank lines everywhere and the diff
// view lights up with spurious "added blank line" changes. Comparing the
// normalized form instead keeps those cosmetic differences invisible.
//
// This is for comparison and diff display ONLY. Never store or push the
// normalized output to Jira: collapsing blank lines around lists can change
// markdown semantics (e.g. a following paragraph could be absorbed into a list).

const LIST_LINE = /^\s*(?:[-*+]|\d+[.)])\s+/;
// A list marker with no content after it ("- ", "*", "1."). The rich editor
// keeps an accidental empty bullet and re-serializes it, while the original
// markdown may have dropped it; treating it as nothing keeps the two equal.
const EMPTY_LIST_LINE = /^\s*(?:[-*+]|\d+[.)])\s*$/;
const FENCE = /^\s*(?:```|~~~)/;
// Callout/expand panel fence (:::info, :::, :::expand ...). adfToMarkdown emits
// a blank line hugging the closing fence that the source markdown lacks.
const PANEL_FENCE = /^\s*:::/;

/**
 * Returns a canonical form where blank lines adjacent to list items are removed
 * (equalizing the tight-vs-loose serializer mismatch) and any remaining run of
 * blank lines is collapsed to one. Content inside fenced code blocks is left
 * untouched. The result is trimmed of leading/trailing blank lines.
 */
export function normalizeMarkdownForCompare(md: string): string {
  if (!md) return "";

  const raw = md.replace(/\r\n?/g, "\n").split("\n");
  const stripEnd = (l: string) => l.replace(/\s+$/, "");
  const out: string[] = [];
  let inFence = false;

  for (let i = 0; i < raw.length; i++) {
    const original = raw[i];

    if (FENCE.test(original)) {
      inFence = !inFence;
      out.push(stripEnd(original));
      continue;
    }
    if (inFence) {
      out.push(original);
      continue;
    }

    const line = stripEnd(original);
    if (line !== "") {
      // Drop empty list markers entirely so an accidental empty bullet does not
      // register as a real content difference between serializers.
      if (EMPTY_LIST_LINE.test(line)) continue;
      out.push(line);
      continue;
    }

    // Blank line: decide whether to keep a single collapsed separator.
    const prev = out.length ? out[out.length - 1] : "";
    let k = i + 1;
    while (
      k < raw.length &&
      !FENCE.test(raw[k]) &&
      (stripEnd(raw[k]) === "" || EMPTY_LIST_LINE.test(stripEnd(raw[k])))
    )
      k++;
    const next = k < raw.length && !FENCE.test(raw[k]) ? stripEnd(raw[k]) : "";

    // Drop blank lines hugging a list (tight/loose normalization).
    if (LIST_LINE.test(prev) || LIST_LINE.test(next)) continue;
    // Drop blank lines hugging a panel fence (adfToMarkdown adds one).
    if (PANEL_FENCE.test(prev) || PANEL_FENCE.test(next)) continue;
    // Collapse consecutive blanks and trim leading blanks.
    if (out.length === 0 || out[out.length - 1] === "") continue;
    out.push("");
  }

  while (out.length && out[0] === "") out.shift();
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

/** True when two markdown strings are identical apart from cosmetic blank-line spacing. */
export function markdownEqualIgnoringSpacing(a: string, b: string): boolean {
  return normalizeMarkdownForCompare(a) === normalizeMarkdownForCompare(b);
}
