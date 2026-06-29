import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ActiveInboxDigest } from "@/lib/api-client";
import { InboxDigestBanner } from "./InboxDigestBanner";

const h = vi.hoisted(() => ({
  active: null as ActiveInboxDigest | null,
  mutate: vi.fn(),
  push: vi.fn(),
  dismiss: vi.fn(),
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
  },
}));

describe("InboxDigestBanner (BRDG-413)", () => {
  beforeEach(() => {
    h.active = null;
    h.mutate = vi.fn().mockResolvedValue(undefined);
    h.push = vi.fn();
    h.dismiss = vi.fn().mockResolvedValue({ ok: true });
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
    expect(h.push).toHaveBeenCalledWith("/inbox");
    await waitFor(() => expect(h.dismiss).toHaveBeenCalledTimes(1));
  });

  it("Minimize collapses the card into a count bubble without clearing the digest", () => {
    h.active = { id: "x", generatedAt: "x", baselineAt: null, total: 10, buckets: [] };
    render(<InboxDigestBanner />);

    expect(screen.getByText("10 new tickets in your inbox")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));

    expect(screen.queryByText("10 new tickets in your inbox")).not.toBeInTheDocument();
    const bubble = screen.getByRole("button", { name: /Open inbox digest: 10 new tickets/ });
    expect(bubble).toHaveTextContent("10");
    // Minimize is purely a UI collapse; it must not dismiss on the server.
    expect(h.dismiss).not.toHaveBeenCalled();
  });

  it("clicking the bubble re-expands the full card", () => {
    h.active = { id: "x", generatedAt: "x", baselineAt: null, total: 6, buckets: [] };
    render(<InboxDigestBanner />);

    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    fireEvent.click(screen.getByRole("button", { name: /Open inbox digest/ }));

    expect(screen.getByText("6 new tickets in your inbox")).toBeInTheDocument();
  });

  it("stays collapsed across reloads when the stored id matches the active digest", () => {
    localStorage.setItem("inbox-digest-collapsed-id", "x");
    h.active = { id: "x", generatedAt: "x", baselineAt: null, total: 3, buckets: [] };
    render(<InboxDigestBanner />);

    expect(screen.queryByText("3 new tickets in your inbox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Open inbox digest: 3 new tickets/ }),
    ).toBeInTheDocument();
  });

  it("re-expands when a new digest id no longer matches the stored collapse", () => {
    localStorage.setItem("inbox-digest-collapsed-id", "old");
    h.active = { id: "new", generatedAt: "x", baselineAt: null, total: 5, buckets: [] };
    render(<InboxDigestBanner />);

    expect(screen.getByText("5 new tickets in your inbox")).toBeInTheDocument();
  });

  it("caps the bubble count badge at 99+", () => {
    localStorage.setItem("inbox-digest-collapsed-id", "x");
    h.active = { id: "x", generatedAt: "x", baselineAt: null, total: 150, buckets: [] };
    render(<InboxDigestBanner />);

    expect(screen.getByRole("button", { name: /Open inbox digest/ })).toHaveTextContent("99+");
  });
});
