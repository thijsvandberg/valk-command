import { describe, it, expect, vi, beforeEach } from "vitest";

const defaultMutate = vi.fn();
vi.mock("swr", () => ({ mutate: (...args: unknown[]) => defaultMutate(...args) }));

import { scopedMutate, registerScopedMutate, __resetScopedMutateForTests } from "./swr-scoped-mutate";
import type { ScopedMutator } from "swr";

describe("scopedMutate", () => {
  beforeEach(() => {
    __resetScopedMutateForTests();
    defaultMutate.mockReset();
  });

  it("delegates to the registered provider-bound mutator once registered", () => {
    const bound = vi.fn();
    registerScopedMutate(bound as unknown as ScopedMutator);

    void scopedMutate("/api/tickets");

    expect(bound).toHaveBeenCalledWith("/api/tickets");
    expect(defaultMutate).not.toHaveBeenCalled();
  });

  it("passes updater and options through to the bound mutator", () => {
    const bound = vi.fn();
    registerScopedMutate(bound as unknown as ScopedMutator);
    const updater = (c: unknown) => c;

    void scopedMutate("/api/tickets/VPL-1", updater, { revalidate: false });

    expect(bound).toHaveBeenCalledWith("/api/tickets/VPL-1", updater, { revalidate: false });
  });

  it("falls back to the default swr mutate while unregistered (pre-provider behaviour)", () => {
    void scopedMutate("/api/tickets");

    expect(defaultMutate).toHaveBeenCalledWith("/api/tickets");
  });

  it("returns to the fallback after a test reset", () => {
    const bound = vi.fn();
    registerScopedMutate(bound as unknown as ScopedMutator);
    __resetScopedMutateForTests();

    void scopedMutate("/api/tickets");

    expect(bound).not.toHaveBeenCalled();
    expect(defaultMutate).toHaveBeenCalledWith("/api/tickets");
  });
});
