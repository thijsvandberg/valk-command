import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ActiveInboxDigest } from "@/lib/api-client";
import { InboxDigestBanner } from "./InboxDigestBanner";

const h = vi.hoisted(() => ({
  active: null as ActiveInboxDigest | null,
  mutate: vi.fn(),
  push: vi.fn(),
  dismiss: vi.fn(),
  snooze: vi.fn(),
}));

vi.mock("swr", () => ({
  __esModule: true,
  default: () => ({ data: { active: h.active }, mutate: h.mutate }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
}));

vi.mock("@/lib/api-client", () => ({
  swrFetcher: vi.fn(),
  inboxDigest: {
    url: () => "/api/inbox/digest",
    dismiss: (...args: unknown[]) => h.dismiss(...args),
    snooze: (...args: unknown[]) => h.snooze(...args),
  },
}));

describe("InboxDigestBanner (BRDG-413)", () => {
  beforeEach(() => {
    h.active = null;
    h.mutate = vi.fn().mockResolvedValue(undefined);
    h.push = vi.fn();
    h.dismiss = vi.fn().mockResolvedValue({ ok: true });
    h.snooze = vi.fn().mockResolvedValue({ ok: true });
    sessionStorage.clear();
    localStorage.clear();
  });

  it("renders nothing when there is no active digest", () => {
    const { container } = render(<InboxDigestBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the total and per-bucket breakdown", () => {
    h.active = {
      id: "2026-06-26:morning",
      generatedAt: "2026-06-26T07:30:00Z",
      baselineAt: "2026-06-24T10:00:00Z",
      total: 7,
      buckets: [
        { key: "team_board", label: "On your team's board", count: 3 },
        { key: "teammates", label: "From your teammates", count: 2 },
        { key: "generic_backlog", label: "Generic backlog", count: 2 },
      ],
    };
    render(<InboxDigestBanner />);

    expect(screen.getByText("7 new tickets in your inbox")).toBeInTheDocument();
    expect(screen.getByText("On your team's board")).toBeInTheDocument();
    expect(screen.getByText("From your teammates")).toBeInTheDocument();
    expect(screen.getByText("Generic backlog")).toBeInTheDocument();
  });

  it("uses the singular noun for a single ticket", () => {
    h.active = {
      id: "2026-06-26:morning",
      generatedAt: "x",
      baselineAt: null,
      total: 1,
      buckets: [],
    };
    render(<InboxDigestBanner />);
    expect(screen.getByText("1 new ticket in your inbox")).toBeInTheDocument();
  });

  it("renders the total only (no bucket list) when there are no buckets", () => {
    h.active = {
      id: "2026-06-26:morning",
      generatedAt: "x",
      baselineAt: null,
      total: 4,
      buckets: [],
    };
    render(<InboxDigestBanner />);
    expect(screen.getByText("4 new tickets in your inbox")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("Dismiss clears the digest on the server", async () => {
    h.active = { id: "x", generatedAt: "x", baselineAt: null, total: 2, buckets: [] };
    render(<InboxDigestBanner />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() => expect(h.dismiss).toHaveBeenCalledTimes(1));
    expect(h.mutate).toHaveBeenCalledWith({ active: null }, { revalidate: false });
    expect(h.push).not.toHaveBeenCalled();
  });

  it("Open inbox sets relevance grouping, clears the digest, and navigates", async () => {
    h.active = { id: "x", generatedAt: "x", baselineAt: null, total: 2, buckets: [] };
    render(<InboxDigestBanner />);

    fireEvent.click(screen.getByRole("button", { name: /Open inbox/ }));

    expect(sessionStorage.getItem("inbox-group-by")).toBe(JSON.stringify("relevance"));
    expect(h.push).toHaveBeenCalledWith("/inbox?new=1");
    await waitFor(() => expect(h.dismiss).toHaveBeenCalledTimes(1));
  });

  it("Snooze hides the banner and snoozes on the server without dismissing (BRDG-462)", async () => {
    h.active = { id: "x", generatedAt: "x", baselineAt: null, total: 10, buckets: [] };
    render(<InboxDigestBanner />);

    expect(screen.getByText("10 new tickets in your inbox")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Snooze for 1 hour" }));

    // Optimistically hidden, snoozed server-side, and NOT dismissed.
    expect(h.mutate).toHaveBeenCalledWith({ active: null }, { revalidate: false });
    await waitFor(() => expect(h.snooze).toHaveBeenCalledTimes(1));
    expect(h.dismiss).not.toHaveBeenCalled();
  });

  it("shows a short confirmation toast after snoozing that auto-hides (BRDG-462)", async () => {
    vi.useFakeTimers();
    try {
      h.active = { id: "x", generatedAt: "x", baselineAt: null, total: 3, buckets: [] };
      render(<InboxDigestBanner />);

      fireEvent.click(screen.getByRole("button", { name: "Snooze for 1 hour" }));
      // The toast shows after the awaited optimistic mutate resolves.
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByText("Snoozed for 1 hour")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByText("Snoozed for 1 hour")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("no longer renders a minimize control or corner bubble (BRDG-462)", () => {
    h.active = { id: "x", generatedAt: "x", baselineAt: null, total: 150, buckets: [] };
    render(<InboxDigestBanner />);

    expect(screen.queryByRole("button", { name: "Minimize" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open inbox digest/ })).not.toBeInTheDocument();
    // The full card renders directly (no collapsed state to toggle into).
    expect(screen.getByText("150 new tickets in your inbox")).toBeInTheDocument();
  });
});
