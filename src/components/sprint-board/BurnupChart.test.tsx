import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BurnupChart } from "./BurnupChart";

vi.mock("swr", () => ({
  default: () => ({
    data: {
      points: [
        { date: "2026-01-01", spDone: 5, bvDone: 3, spScope: 20, bvScope: 15 },
        { date: "2026-01-02", spDone: 10, bvDone: 7, spScope: 20, bvScope: 15 },
      ],
      sprintStart: "2026-01-01",
      sprintEnd: "2026-01-14",
    },
    mutate: vi.fn(),
    isValidating: false,
  }),
}));

vi.mock("@/lib/api-client", () => ({
  burnup: { url: (id: string) => `/api/burnup?sprintId=${id}`, seed: vi.fn().mockResolvedValue({}) },
}));

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
});
