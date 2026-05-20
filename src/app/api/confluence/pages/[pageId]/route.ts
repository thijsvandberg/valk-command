import { NextRequest, NextResponse } from "next/server";
import { confluenceClient } from "@/lib/confluence-client";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limiter";
import DOMPurify from "isomorphic-dompurify";
import { validatePathParam } from "@/lib/api-validation";

type RouteParams = { params: Promise<{ pageId: string }> };

const DEFAULT_MAX_WORDS = 500;
const MAX_ALLOWED_WORDS = 3000;

/**
 * Truncate HTML content to approximately maxWords words.
 * Strips tags to count, then returns the original HTML up to the cutoff point.
 * Rough heuristic — good enough for page previews.
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
 * Convert sanitized HTML to plain text suitable for LLM consumption.
 * Preserves table structure as tab-separated values and newlines for block elements.
 */
function htmlToText(html: string, maxWords: number): { text: string; truncated: boolean } {
  const text = html
    // Table cells and headers become tab-separated
    .replace(/<\/t[hd]>/gi, "\t")
    .replace(/<tr[^>]*>/gi, "")
    .replace(/<\/tr>/gi, "\n")
    // Block elements become newlines
    .replace(/<\/?(p|br|div|li|h[1-6]|pre|blockquote)[^>]*>/gi, "\n")
    // Strip remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Collapse excessive whitespace while preserving intentional newlines
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return { text, truncated: false };
  }

  const truncated = words.slice(0, maxWords).join(" ");
  return { text: truncated, truncated: true };
}

/**
 * GET /api/confluence/pages/[pageId]?format=html|text&maxWords=<number>
 *
 * format=html (default): returns sanitized HTML preview
 * format=text: returns plain text, better for LLM consumption
 * maxWords (default 500, max 3000): controls content length
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const limited = applyRateLimit("read");
  if (limited) return limited;

  const { pageId } = await params;
  const invalid = validatePathParam(pageId);
  if (invalid) return invalid;

  const sp = new URL(req.url).searchParams;
  const rawFormat = sp.get("format") ?? "html";
  if (rawFormat !== "html" && rawFormat !== "text") {
    return NextResponse.json({ error: "format must be html or text" }, { status: 400 });
  }
  const format = rawFormat as "html" | "text";

  const rawMaxWords = sp.get("maxWords");
  let maxWords = DEFAULT_MAX_WORDS;
  if (rawMaxWords !== null) {
    const parsed = parseInt(rawMaxWords, 10);
    if (isNaN(parsed) || parsed < 1) {
      return NextResponse.json({ error: "maxWords must be a positive integer" }, { status: 400 });
    }
    maxWords = Math.min(parsed, MAX_ALLOWED_WORDS);
  }

  if (!confluenceClient.isLive) {
    return NextResponse.json({ error: "Confluence not configured" }, { status: 503 });
  }

  try {
    const page = await confluenceClient.getPage(pageId);

    const sanitized = DOMPurify.sanitize(page.bodyHtml, {
      ALLOWED_TAGS: ["p", "br", "b", "i", "em", "strong", "ul", "ol", "li", "h1", "h2", "h3", "h4", "code", "pre", "blockquote", "a", "span", "div", "table", "thead", "tbody", "tr", "th", "td"],
      ALLOWED_ATTR: ["href", "target", "rel", "class"],
    });

    const base = {
      pageId: page.pageId,
      title: page.title,
      lastModifiedAt: page.lastModifiedAt,
      lastModifiedBy: page.lastModifiedBy,
      url: page.url,
    };

    if (format === "text") {
      const { text, truncated } = htmlToText(sanitized, maxWords);
      return NextResponse.json({ ...base, bodyText: text, truncated }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const { html, truncated } = truncateHtml(sanitized, maxWords);
    return NextResponse.json({ ...base, bodyHtml: html, truncated }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("confluence-pages", "Failed to fetch page", message);
    return NextResponse.json({ error: "Failed to fetch page" }, { status: 502 });
  }
}
