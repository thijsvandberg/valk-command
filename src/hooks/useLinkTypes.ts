import useSWR from "swr";
import { jira, swrFetcher } from "@/lib/api-client";
import type { LinkTypeOption } from "@/app/api/jira/link-types/route";

export const FALLBACK_LINK_TYPES: LinkTypeOption[] = [
  { value: "relates to", label: "Relates to", jiraTypeName: "Relates", direction: "outward" },
  { value: "blocks", label: "Blocks", jiraTypeName: "Blocks", direction: "outward" },
  { value: "is blocked by", label: "Is blocked by", jiraTypeName: "Blocks", direction: "inward" },
  { value: "clones", label: "Clones", jiraTypeName: "Cloners", direction: "outward" },
  { value: "is cloned by", label: "Is cloned by", jiraTypeName: "Cloners", direction: "inward" },
  { value: "duplicates", label: "Duplicates", jiraTypeName: "Duplicate", direction: "outward" },
  { value: "is duplicated by", label: "Is duplicated by", jiraTypeName: "Duplicate", direction: "inward" },
];

/**
 * Fetch all available Jira link types for use in relation dropdowns.
 * Data is cached server-side for 1 week; SWR deduplicates across components.
 */
export function useLinkTypes() {
  const { data, error, isLoading } = useSWR<{ linkTypes: LinkTypeOption[] }>(
    jira.linkTypesUrl(),
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  return {
    linkTypes: data?.linkTypes ?? FALLBACK_LINK_TYPES,
    error,
    isLoading,
  };
}
