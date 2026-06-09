import useSWR from "swr";
import { settings, swrFetcher } from "@/lib/api-client";

/**
 * Reads the PO-configured default sprint (the "default_sprint_id" app setting,
 * e.g. the BT sprint). Returns null when unset so callers can fall back to the
 * Jira-active sprint. SWR-cached so it is cheap to read from the always-mounted
 * launcher.
 */
export function useDefaultSprintId(): string | null {
  const { data } = useSWR<{ sprintId: string }>(settings.defaultSprintUrl(), swrFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const id = data?.sprintId?.trim();
  return id ? id : null;
}
