import type { CalloutType } from "./callout-extension";

const CALLOUT_TYPES: CalloutType[] = ["info", "warning", "error", "note", "success"];
const CALLOUT_REGEX = /^:::(info|warning|error|note|success)\s*$/;

/**
 * Parses markdown with :::type callout fences into HTML that TipTap can consume,
 * and serializes TipTap callout nodes back to :::type markdown.
 */

export function calloutMarkdownToHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const result: string[] = [];
  let insideCallout = false;
  let calloutType: CalloutType = "info";
  let calloutContent: string[] = [];

  for (const line of lines) {
    const openMatch = line.match(CALLOUT_REGEX);

    if (openMatch && !insideCallout) {
      insideCallout = true;
      calloutType = openMatch[1] as CalloutType;
      calloutContent = [];
      continue;
    }

    if (insideCallout && line.trim() === ":::") {
      const inner = calloutContent.join("\n").trim();
      const paragraphs = inner
        .split(/\n\n+/)
        .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
        .join("");
      result.push(
        `<div data-callout-type="${calloutType}" class="callout-block">${paragraphs}</div>`
      );
      insideCallout = false;
      continue;
    }

    if (insideCallout) {
      calloutContent.push(line);
    } else {
      result.push(line);
    }
  }

  // Unclosed callout: flush remaining content as regular lines
  if (insideCallout) {
    result.push(`:::${calloutType}`);
    result.push(...calloutContent);
  }

  return result.join("\n");
}

export function htmlToCalloutMarkdown(html: string): string {
  // Replace callout divs back to :::type fences
  return html.replace(
    /<div data-callout-type="(info|warning|error|note|success)"[^>]*>([\s\S]*?)<\/div>/g,
    (_match, type: string, content: string) => {
      const text = content
        .replace(/<p>/g, "")
        .replace(/<\/p>/g, "\n\n")
        .replace(/<br\s*\/?>/g, "\n")
        .trim();
      return `:::${type}\n${text}\n:::`;
    }
  );
}

export function isCalloutType(value: string): value is CalloutType {
  return CALLOUT_TYPES.includes(value as CalloutType);
}
