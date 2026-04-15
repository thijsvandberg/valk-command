import { NextRequest, NextResponse } from "next/server";
import { confluenceClient } from "@/lib/confluence-client";
import { applyRateLimit } from "@/lib/rate-limiter";
import DOMPurify from "isomorphic-dompurify";

type RouteParams = { params: Promise<{ pageId: string }> };

/**
 * Truncate HTML content to approximately maxWords words.
 * Strips tags to count, then returns the original HTML up to the cutoff point.
 * Rough heuristic — good enough for a 500-word preview.
 */
function truncateHtml(html: string, maxWords: number): { html: string; truncated: boolean } {
  const stripped = html.replace(/<[^>]+>/g, " ");
  const words = stripped.split(/\s+/).filter(Boolean);

  if (words.length <= maxWords) {
    return { html, truncated: false };
  }

  // Find the character position of the maxWords-th word boundary in the original HTML
  let wordCount = 0;
  let charPos = 0;
  let inTag = false;

  while (charPos < html.length && wordCount < maxWords) {
    const ch = html[charPos];
    if (ch === "<") {
      inTag = true;
    } else if (ch === ">") {
      inTag = false;
    } else if (!inTag && /\S/.test(ch)) {
      // Start of a word — count it
      while (charPos < html.length && /\S/.test(html[charPos]) && html[charPos] !== "<") {
        charPos++;
      }
      wordCount++;
      continue;
    }
    charPos++;
  }

  return { html: html.slice(0, charPos).trimEnd(), truncated: true };
}

/**
 * GET /api/confluence/pages/[pageId]
 *
 * Fetches and returns sanitized HTML preview of a Confluence page, truncated
 * to approximately 500 words.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const limited = applyRateLimit("read");
  if (limited) return limited;

  const { pageId } = await params;

  if (!confluenceClient.isLive) {
    return NextResponse.json({ error: "Confluence not configured" }, { status: 503 });
  }

  try {
    const page = await confluenceClient.getPage(pageId);

    // Sanitize before truncating so the HTML is clean throughout
    const sanitized = DOMPurify.sanitize(page.bodyHtml, {
      ALLOWED_TAGS: ["p", "br", "b", "i", "em", "strong", "ul", "ol", "li", "h1", "h2", "h3", "h4", "code", "pre", "blockquote", "a", "span", "div", "table", "thead", "tbody", "tr", "th", "td"],
      ALLOWED_ATTR: ["href", "target", "rel", "class"],
    });

    const { html: truncatedHtml, truncated } = truncateHtml(sanitized, 500);

    return NextResponse.json({
      pageId: page.pageId,
      title: page.title,
      bodyHtml: truncatedHtml,
      lastModifiedAt: page.lastModifiedAt,
      lastModifiedBy: page.lastModifiedBy,
      url: page.url,
      truncated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
