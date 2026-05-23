/**
 * Parses AI output text into a list of subtask title strings.
 * Handles numbered lists (1. foo), bulleted lists (- foo, * foo),
 * and mixed formats. Strips markdown bold/backtick formatting.
 */
export function parseSubtaskSuggestions(output: string): string[] {
  if (!output || !output.trim()) return [];

  const lines = output.split("\n");
  const titles: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Match numbered (1. / 1) ) or bulleted (- / * / +) list items
    const match = line.match(/^(?:\d+[.)]\s+|[-*+]\s+)(.+)$/);
    if (!match) continue;

    let title = match[1].trim();

    // Strip markdown bold (**text** or __text__)
    title = title.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
    // Strip inline code backticks
    title = title.replace(/`(.+?)`/g, "$1");
    // Strip trailing punctuation that's clearly not part of a title
    title = title.replace(/[.;:]+$/, "").trim();

    if (title.length > 0 && title.length <= 255) {
      titles.push(title);
    }
  }

  return titles;
}
