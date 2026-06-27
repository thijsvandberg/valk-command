import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  SkeletonLine,
  SkeletonCard,
  SkeletonTable,
  Skeleton,
  SkeletonRow,
  skeletonRowOpacity,
  SKELETON_ROW_FADE,
} from "./Skeleton";

describe("skeletonRowOpacity", () => {
  it("fades each row by the single shared constant", () => {
    expect(skeletonRowOpacity(0)).toBe(1);
    expect(skeletonRowOpacity(1)).toBeCloseTo(1 - SKELETON_ROW_FADE);
    expect(skeletonRowOpacity(2)).toBeCloseTo(1 - 2 * SKELETON_ROW_FADE);
  });

  it("floors the opacity so long lists never fade fully out", () => {
    expect(skeletonRowOpacity(100)).toBe(0.2);
  });
});

describe("Skeleton", () => {
  it("renders a pulsing aria-hidden block and merges className", () => {
    const { container } = render(<Skeleton className="h-4 w-16 rounded" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass("animate-pulse");
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el.className).toContain("h-4");
  });
});

describe("SkeletonRow", () => {
  it("applies the shared fade for its index", () => {
    const { container } = render(<SkeletonRow index={2} className="h-11" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass("animate-pulse");
    expect(el.style.opacity).toBe(String(skeletonRowOpacity(2)));
  });
});

describe("SkeletonLine", () => {
  it("renders with animate-pulse class", () => {
    const { container } = render(<SkeletonLine />);
    expect(container.firstChild).toHaveClass("animate-pulse");
  });

  it("applies custom width and height", () => {
    const { container } = render(<SkeletonLine width="w-32" height="h-6" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("w-32");
    expect(el.className).toContain("h-6");
  });

  it("merges additional className", () => {
    const { container } = render(<SkeletonLine className="mb-2" />);
    expect((container.firstChild as HTMLElement).className).toContain("mb-2");
  });

  it("is aria-hidden", () => {
    const { container } = render(<SkeletonLine />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("SkeletonCard", () => {
  it("renders the default number of skeleton lines", () => {
    const { container } = render(<SkeletonCard />);
    // default is 3 lines
    const lines = container.querySelectorAll(".animate-pulse");
    expect(lines.length).toBe(3);
  });

  it("renders a custom number of lines", () => {
    const { container } = render(<SkeletonCard lines={5} />);
    const lines = container.querySelectorAll(".animate-pulse");
    expect(lines.length).toBe(5);
  });

  it("merges additional className on the card", () => {
    const { container } = render(<SkeletonCard className="my-4" />);
    expect((container.firstChild as HTMLElement).className).toContain("my-4");
  });
});

describe("SkeletonTable", () => {
  it("renders the default number of rows", () => {
    const { container } = render(<SkeletonTable />);
    // header row + 5 data rows, each has a SkeletonLine; header line + 5 row lines = 6 animate-pulse elements
    const lines = container.querySelectorAll(".animate-pulse");
    expect(lines.length).toBe(6); // 1 header + 5 rows
  });

  it("renders a custom number of rows", () => {
    const { container } = render(<SkeletonTable rows={3} />);
    const lines = container.querySelectorAll(".animate-pulse");
    expect(lines.length).toBe(4); // 1 header + 3 rows
  });

  it("is aria-hidden", () => {
    const { container } = render(<SkeletonTable />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("merges additional className", () => {
    const { container } = render(<SkeletonTable className="mt-4" />);
    expect((container.firstChild as HTMLElement).className).toContain("mt-4");
  });
});
