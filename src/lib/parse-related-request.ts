export interface RelatedRequest {
  // The topic to search for, extracted by the compose skill from the PO's message.
  query: string;
  // Raw sprint mention as the PO typed it ("139", "BT 139"), or null when none.
  // Resolution to a real sprint id happens server-side, not here.
  sprint: string | null;
}

// The compose skill (write-story-draft) emits a single self-closing signal tag when
// the PO asks to find/link related stories, e.g.
//   <related-request query="domain resolving" sprint="139" />
// Bridge parses it and auto-chains a targeted find-related search. Mirrors the
// attribute-extraction style of parseLinkSuggestions so attribute order is irrelevant.
export function parseRelatedRequest(output: string): RelatedRequest | null {
  const tag = output.match(/<related-request\b([^>]*?)\/?>/i);
  if (!tag) return null;

  const attrs = tag[1];
  const query = attrs.match(/\bquery="([^"]*)"/i)?.[1]?.trim() ?? "";
  if (!query) return null;

  const sprintRaw = attrs.match(/\bsprint="([^"]*)"/i)?.[1]?.trim() ?? "";
  return { query, sprint: sprintRaw ? sprintRaw : null };
}

export function stripRelatedRequestTags(content: string): string {
  return content.replace(/<related-request\b[^>]*?\/?>(?:<\/related-request>)?/gi, "");
}
