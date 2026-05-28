import { NextResponse } from "next/server";
import { jiraClient } from "@/lib/jira-client";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";

const CACHE_KEY = "jira:link-types";
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface LinkTypeOption {
  value: string;
  label: string;
  jiraTypeName: string;
  direction: "inward" | "outward";
}

// Hardcoded fallback for when Jira is unreachable
const FALLBACK_OPTIONS: LinkTypeOption[] = [
  { value: "relates to", label: "Relates to", jiraTypeName: "Relates", direction: "outward" },
  { value: "blocks", label: "Blocks", jiraTypeName: "Blocks", direction: "outward" },
  { value: "is blocked by", label: "Is blocked by", jiraTypeName: "Blocks", direction: "inward" },
  { value: "clones", label: "Clones", jiraTypeName: "Cloners", direction: "outward" },
  { value: "is cloned by", label: "Is cloned by", jiraTypeName: "Cloners", direction: "inward" },
  { value: "duplicates", label: "Duplicates", jiraTypeName: "Duplicate", direction: "outward" },
  { value: "is duplicated by", label: "Is duplicated by", jiraTypeName: "Duplicate", direction: "inward" },
];

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * GET /api/jira/link-types
 *
 * Returns all available issue link types as a flat list of dropdown options.
 * Cached server-side for 1 week.
 */
export async function GET() {
  const cached = cache.get<LinkTypeOption[]>(CACHE_KEY);
  if (cached) {
    return NextResponse.json({ linkTypes: cached });
  }

  try {
    const jiraTypes = await jiraClient.getIssueLinkTypes();

    if (!jiraTypes.length) {
      return NextResponse.json({ linkTypes: FALLBACK_OPTIONS });
    }

    const options: LinkTypeOption[] = [];
    for (const lt of jiraTypes) {
      options.push({
        value: lt.outward,
        label: titleCase(lt.outward),
        jiraTypeName: lt.name,
        direction: "outward",
      });
      // Only add inward if it differs from outward (skip symmetric types like "relates to")
      if (lt.inward !== lt.outward) {
        options.push({
          value: lt.inward,
          label: titleCase(lt.inward),
          jiraTypeName: lt.name,
          direction: "inward",
        });
      }
    }

    // Sort alphabetically by label for consistent dropdown order
    options.sort((a, b) => a.label.localeCompare(b.label));

    cache.set(CACHE_KEY, options, ONE_WEEK_MS);
    return NextResponse.json({ linkTypes: options });
  } catch (err) {
    logger.error("link-types", `Failed to fetch Jira link types: ${err}`);
    return NextResponse.json({ linkTypes: FALLBACK_OPTIONS });
  }
}
