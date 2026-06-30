import { ApiError } from "@/lib/api-client";
import { reportClientError } from "@/lib/client-error";

// Central SWR fetch-failure forwarder (BRDG-398). Every keyed fetch that throws
// (the shared fetcher throws ApiError on a non-ok response) routes here, so a
// failed load is recorded once with its key + HTTP status. Throttling lives in
// reportClientError, so a key that retries on a loop cannot flood the log.
//
// Lives in a client-safe lib (not SWRProvider) so data hooks can re-use it from
// their own onError without importing the provider component module. SWRProvider
// re-exports it for the global config and its existing test (BRDG-448).
export function handleSwrError(error: unknown, key: string): void {
  const status = error instanceof ApiError ? error.status : undefined;
  const context = `swr ${key}${status !== undefined ? ` status=${status}` : ""}`;
  reportClientError(context, error, { source: "swr" });
}
