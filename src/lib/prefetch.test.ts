import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("swr", () => ({
  preload: vi.fn(),
}));

vi.mock("@/components/SWRProvider", () => ({
  fetcher: vi.fn(),
}));

import { prefetchTicketDetail, prefetchTicketList } from "./prefetch";
import { preload } from "swr";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("prefetch", () => {
  it("prefetchTicketDetail calls preload with correct URL", () => {
    prefetchTicketDetail("VPL-123");
    expect(preload).toHaveBeenCalledWith("/api/tickets/VPL-123", expect.any(Function));
  });

  it("prefetchTicketList calls preload with correct URL", () => {
    prefetchTicketList("12345");
    expect(preload).toHaveBeenCalledWith("/api/tickets?sprintId=12345", expect.any(Function));
  });

  it("encodes special characters in ticket keys", () => {
    prefetchTicketDetail("VPL-1/2");
    expect(preload).toHaveBeenCalledWith("/api/tickets/VPL-1%2F2", expect.any(Function));
  });
});
