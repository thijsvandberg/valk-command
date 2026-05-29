import { vi } from "vitest";

/**
 * Creates a mock for `@/lib/bitbucket-client` suitable for `vi.mock()`.
 *
 * Usage:
 *   vi.mock("@/lib/bitbucket-client", () => createBitbucketClientMock());
 */
export function createBitbucketClientMock(overrides?: Record<string, unknown>) {
  return {
    isConfigured: vi.fn().mockReturnValue(true),
    fetchDevInfo: vi.fn().mockResolvedValue({
      branches: [],
      pullRequests: [],
      commits: [],
      builds: [],
      deployments: [],
    }),
    extractAuthor: vi.fn().mockReturnValue("Unknown"),
    normalisePrStatus: vi.fn().mockReturnValue("OPEN"),
    normaliseBuildState: vi.fn().mockReturnValue("SUCCESSFUL"),
    shortRepoName: vi.fn().mockImplementation((slug: string) => slug),
    containsExactKey: vi.fn().mockReturnValue(false),
    detectEnvironment: vi.fn().mockReturnValue(null),
    EMPTY_DEV_INFO: {
      branches: [],
      pullRequests: [],
      commits: [],
      builds: [],
      deployments: [],
    },
    ...overrides,
  };
}
