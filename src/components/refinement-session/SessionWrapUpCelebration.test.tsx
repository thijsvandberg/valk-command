import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionWrapUpCelebration } from "./SessionWrapUpCelebration";

const mockContext = {
  queue: ["VPL-1", "VPL-2", "VPL-3"],
  sessionEstimates: {} as Record<string, number | null>,
  sessionStartedAt: null as number | null,
};

vi.mock("@/contexts/RefinementSessionContext", () => ({
  useRefinementSession: () => mockContext,
}));

const mockTickets = [
  { key: "VPL-1", title: "First ticket", storyPoints: 3 },
  { key: "VPL-2", title: "Second ticket", storyPoints: 5 },
  { key: "VPL-3", title: "Third ticket", storyPoints: null },
];

vi.mock("@/hooks/useSprintBoard", () => ({
  useTicketsByKeys: () => mockTickets,
}));

function stubMatchMedia(reducedMotion: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: reducedMotion,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

function renderCelebration() {
  return render(
    <SessionWrapUpCelebration>
      <div data-testid="modal-stub">modal</div>
    </SessionWrapUpCelebration>,
  );
}

describe("SessionWrapUpCelebration", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    mockContext.queue = ["VPL-1", "VPL-2", "VPL-3"];
    mockContext.sessionEstimates = {};
    mockContext.sessionStartedAt = null;
  });

  it("renders the headline with ticket count and total points from the cache", () => {
    renderCelebration();

    expect(screen.getByText("Queue cleared")).toBeInTheDocument();
    // 3 + 5 + null -> 8 points
    expect(screen.getByText(/3 tickets refined · 8 points/)).toBeInTheDocument();
  });

  it("lets session estimates take precedence over cached story points", () => {
    // VPL-1 re-estimated to 8 during the session, VPL-3 estimated to 2 (cache
    // still null); VPL-2 keeps its cached 5.
    mockContext.sessionEstimates = { "VPL-1": 8, "VPL-3": 2 };
    renderCelebration();

    expect(screen.getByText(/3 tickets refined · 15 points/)).toBeInTheDocument();
  });

  it("shows the session duration when sessionStartedAt is set", () => {
    mockContext.sessionStartedAt = Date.now() - 15 * 60 * 1000;
    renderCelebration();

    expect(screen.getByText(/· 15 minutes — wrap up below/)).toBeInTheDocument();
  });

  it("omits the duration when sessionStartedAt is null", () => {
    renderCelebration();

    const subline = screen.getByText(/3 tickets refined/);
    expect(subline.textContent).not.toMatch(/minute/);
    expect(subline.textContent).toMatch(/wrap up below/);
  });

  it("uses singular wording for a one-ticket, one-minute session", () => {
    mockContext.queue = ["VPL-1"];
    mockContext.sessionStartedAt = Date.now() - 30 * 1000;
    renderCelebration();

    expect(screen.getByText(/1 ticket refined · 3 points · 1 minute — wrap up below/)).toBeInTheDocument();
  });

  it("fires both corner cannons (20 pieces per side)", () => {
    renderCelebration();

    expect(screen.getAllByTestId("wrapup-confetti-piece")).toHaveLength(40);
  });

  it("renders no confetti under prefers-reduced-motion, keeping halo and headline", () => {
    stubMatchMedia(true);
    renderCelebration();

    expect(screen.queryAllByTestId("wrapup-confetti-piece")).toHaveLength(0);
    expect(screen.getByText("Queue cleared")).toBeInTheDocument();
  });

  it("never blocks interaction with the modal: ambience layers are pointer-events-none", () => {
    const { container } = renderCelebration();

    expect(screen.getByTestId("modal-stub")).toBeInTheDocument();
    // The lucide icon is also aria-hidden; only the div/span layers are ambience.
    const ambience = container.querySelectorAll("div[aria-hidden], span[aria-hidden]");
    expect(ambience.length).toBeGreaterThan(0);
    ambience.forEach((el) => {
      expect(el.className).toContain("pointer-events-none");
    });
  });
});
