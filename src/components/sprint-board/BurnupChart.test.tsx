import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BurnupChart } from "./BurnupChart";

const SEEDED_DATA = {
  seeded: true,
  points: [
    { date: "2026-01-01", spDone: 5, bvDone: 3, spScope: 20, bvScope: 15 },
    { date: "2026-01-02", spDone: 10, bvDone: 7, spScope: 20, bvScope: 15 },
  ],
  sprintStart: "2026-01-01",
  sprintEnd: "2026-01-14",
};

const { mockSeed, swrState } = vi.hoisted(() => ({
  mockSeed: vi.fn(),
  swrState: { data: undefined as unknown },
}));

vi.mock("swr", () => ({
  default: () => ({ data: swrState.data, mutate: vi.fn(), isValidating: false }),
}));

vi.mock("@/lib/api-client", () => ({
  burnup: { url: (id: string) => `/api/burnup?sprintId=${id}`, seed: mockSeed },
}));

beforeEach(() => {
  mockSeed.mockReset();
  mockSeed.mockResolvedValue({});
  swrState.data = SEEDED_DATA;
});

describe("BurnupChart", () => {
  it("renders chart container", () => {
    const { container } = render(<BurnupChart sprintId="s1" totalSp={20} totalBv={15} />);
    expect(container.querySelector("svg") || container.querySelector("div")).toBeInTheDocument();
  });

  it("renders with data points from SWR", () => {
    const { container } = render(<BurnupChart sprintId="s1" totalSp={20} totalBv={15} />);
    // Chart should render without errors
    expect(container.firstChild).toBeInTheDocument();
  });

  it("does not seed a sprint whose history is already seeded", async () => {
    swrState.data = { ...SEEDED_DATA, seeded: true };
    render(<BurnupChart sprintId="s1" totalSp={20} totalBv={15} />);
    await Promise.resolve();
    expect(mockSeed).not.toHaveBeenCalled();
  });

  it("auto-seeds an unseeded sprint", async () => {
    swrState.data = { ...SEEDED_DATA, seeded: false };
    render(<BurnupChart sprintId="s1" totalSp={20} totalBv={15} />);
    await waitFor(() => expect(mockSeed).toHaveBeenCalledWith("s1"));
  });

  // Regression: the seed guard used to be a single boolean that never reset, so only the
  // first sprint viewed in a session auto-seeded. It is now keyed by sprintId.
  it("seeds again when switching to a second unseeded sprint", async () => {
    swrState.data = { ...SEEDED_DATA, seeded: false };
    const { rerender } = render(<BurnupChart sprintId="s1" totalSp={20} totalBv={15} />);
    await waitFor(() => expect(mockSeed).toHaveBeenCalledWith("s1"));

    rerender(<BurnupChart sprintId="s2" totalSp={20} totalBv={15} />);
    await waitFor(() => expect(mockSeed).toHaveBeenCalledWith("s2"));
  });
});
