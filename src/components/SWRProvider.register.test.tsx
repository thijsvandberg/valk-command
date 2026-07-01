import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// The bridge must hand SWRProvider's provider-bound mutator to the scoped-mutate
// registry on mount, so non-hook modules (ticket-cache, sprint-board-utils,
// prefetch, row-actions adapter) reach the lruProvider cache instead of the
// default cache the top-level "swr" mutate targets (BRDG-458).
const registerSpy = vi.fn();
vi.mock("@/lib/swr-scoped-mutate", () => ({
  registerScopedMutate: (...args: unknown[]) => registerSpy(...args),
}));

// The sync bridge opens an SSE stream; irrelevant here.
vi.mock("@/components/TicketSyncBridge", () => ({ TicketSyncBridge: () => null }));

import { SWRProvider } from "./SWRProvider";

describe("SWRProvider scoped-mutate registration", () => {
  beforeEach(() => registerSpy.mockReset());

  it("registers the provider-bound mutate on mount", () => {
    render(
      <SWRProvider>
        <div />
      </SWRProvider>,
    );

    expect(registerSpy).toHaveBeenCalledTimes(1);
    expect(typeof registerSpy.mock.calls[0][0]).toBe("function");
  });
});
