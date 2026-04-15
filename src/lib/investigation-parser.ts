export interface InvestigationRelatedStory {
  key: string;
  summary: string;
  relevance: string;
}

export interface InvestigationKeyFile {
  file: string;
  purpose: string;
}

export interface InvestigationData {
  question: string;
  finding: string;
  howItWorks: string | null;
  whatsMissing: string | null;
  whatWouldBeNeeded: string | null;
  relatedStories: InvestigationRelatedStory[];
  keyFiles: InvestigationKeyFile[];
  stakeholderSummary: string | null;
  isLong: boolean;
}

/**
 * Detect whether content looks like an investigation result.
 * Requires both "## Question" and "## Finding" headings.
 */
export function isInvestigationResult(content: string): boolean {
  return /^## Question/m.test(content) && /^## Finding/m.test(content);
}

/**
 * Parse a pipe-delimited GFM table body into rows of cell values.
 * Skips the header separator row (contains only dashes/pipes/spaces).
 */
function parseTableRows(tableText: string): string[][] {
  const lines = tableText.trim().split("\n");
  const rows: string[][] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    // Skip separator rows like |-----|---------|
    if (/^\|[\s\-:|]+\|$/.test(trimmed)) continue;

    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

    rows.push(cells);
  }

  return rows;
}

function parseRelatedStories(sectionContent: string): InvestigationRelatedStory[] {
  const rows = parseTableRows(sectionContent);
  // First row is the header (Key | Summary | Relevance)
  return rows.slice(1).map((cells) => ({
    key: cells[0]?.replace(/`/g, "").trim() ?? "",
    summary: cells[1]?.trim() ?? "",
    relevance: cells[2]?.trim() ?? "",
  })).filter((s) => s.key.length > 0);
}

function parseKeyFiles(sectionContent: string): InvestigationKeyFile[] {
  const rows = parseTableRows(sectionContent);
  return rows.slice(1).map((cells) => ({
    file: cells[0]?.replace(/`/g, "").trim() ?? "",
    purpose: cells[1]?.trim() ?? "",
  })).filter((f) => f.file.length > 0);
}

/**
 * Parse investigation markdown output into structured data.
 * Returns null if the content is not a valid investigation result.
 */
export function parseInvestigationResult(content: string): InvestigationData | null {
  if (!isInvestigationResult(content)) return null;

  // Split the content on ## headings, preserving the heading text
  const sections = new Map<string, string>();
  const sectionRegex = /^## (.+)$/gm;
  const matches = [...content.matchAll(sectionRegex)];

  for (let i = 0; i < matches.length; i++) {
    const heading = matches[i][1].trim();
    const start = matches[i].index! + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : content.length;
    sections.set(heading.toLowerCase(), content.slice(start, end).trim());
  }

  const question = sections.get("question") ?? "";
  const finding = sections.get("finding") ?? "";

  if (!question || !finding) return null;

  const howItWorks = sections.get("how it works") ?? null;
  const whatsMissing = sections.get("what's missing") ?? sections.get("whats missing") ?? null;
  const whatWouldBeNeeded = sections.get("what would be needed") ?? null;

  const relatedStoriesRaw = sections.get("related stories") ?? "";
  const relatedStories = relatedStoriesRaw ? parseRelatedStories(relatedStoriesRaw) : [];

  const keyFilesRaw = sections.get("key files") ?? "";
  const keyFiles = keyFilesRaw ? parseKeyFiles(keyFilesRaw) : [];

  const stakeholderSummary = sections.get("summary (non-technical)") ?? null;

  const isLong = content.length > 1500;

  return {
    question,
    finding,
    howItWorks,
    whatsMissing,
    whatWouldBeNeeded,
    relatedStories,
    keyFiles,
    stakeholderSummary,
    isLong,
  };
}
