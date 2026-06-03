import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RefinementGemTrigger, type RefinementCardTicketInfo } from "./RefinementGemHoverCard";
import type { TicketSessionEntry } from "@/hooks/useTicketSessionMap";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/sprint-board"),
}));

function session(over: Partial<TicketSessionEntry> = {}): TicketSessionEntry {
  const ticketKeys = over.ticketKeys ?? ["VPL-482", "VPL-483", "VPL-484"];
  return {
    id: "s1",
    name: "In refinement: 2026-06-02",
    ticketKeys,
    ticketCount: ticketKeys.length,
    ...over,
  };
}

const INFO = new Map<string, RefinementCardTicketInfo>([
  ["VPL-482", { title: "Hold inventory on quote", type: "story", jiraStatus: "TO DO", readiness: "ready_to_refine" }],
  ["VPL-483", { title: "Deposit and payment split", type: "story", jiraStatus: "TO DO", readiness: null }],
]);

function renderTrigger(props: Partial<React.ComponentProps<typeof RefinementGemTrigger>> = {}) {
  const result = render(
    <RefinementGemTrigger
      sessions={[session()]}
      currentKey="VPL-482"
      ticketInfoMap={INFO}
      {...props}
    >
      <span data-testid="gem">gem</span>
    </RefinementGemTrigger>,
  );
  const trigger = result.container.querySelector('span[tabindex="0"]') as HTMLElement;
  return { ...result, trigger };
}

/** Open the card by hovering the trigger and flushing the open delay. */
function open(trigger: HTMLElement) {
  fireEvent.mouseEnter(trigger);
  act(() => { vi.advanceTimersByTime(300); });
}

describe("RefinementGemTrigger", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it("does not render the card until hovered", () => {
    renderTrigger();
    expect(screen.queryByText("In refinement: 2026-06-02")).toBeNull();
  });

  it("opens on hover after the delay and lists member tickets", () => {
    const { trigger } = renderTrigger();
    fireEvent.mouseEnter(trigger);
    expect(screen.queryByText("In refinement: 2026-06-02")).toBeNull(); // before the delay
    act(() => { vi.advanceTimersByTime(300); });

    expect(screen.getByText("In refinement: 2026-06-02")).toBeInTheDocument();
    expect(screen.getByText("3 items")).toBeInTheDocument();
    // Title shown next to the standard pill when board data resolves it.
    expect(screen.getByText("Hold inventory on quote")).toBeInTheDocument();
    // No board info for VPL-484 -> the pill still renders the key (once), no title text.
    expect(screen.getAllByText("VPL-484")).toHaveLength(1);
  });

  it("opens on keyboard focus too", () => {
    const { trigger } = renderTrigger();
    fireEvent.focus(trigger);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText("In refinement: 2026-06-02")).toBeInTheDocument();
  });

  it("highlights the current ticket row", () => {
    const { trigger } = renderTrigger();
    open(trigger);
    const currentPill = screen.getByText("VPL-482");
    const row = currentPill.closest("li");
    expect(row?.className).toContain("color-brand-500");
  });

  it("closes on Escape", () => {
    const { trigger } = renderTrigger();
    open(trigger);
    expect(screen.getByText("In refinement: 2026-06-02")).toBeInTheDocument();
    act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
    expect(screen.queryByText("In refinement: 2026-06-02")).toBeNull();
  });

  it("closes after leaving the trigger (grace period)", () => {
    const { trigger } = renderTrigger();
    open(trigger);
    fireEvent.mouseLeave(trigger);
    act(() => { vi.advanceTimersByTime(250); });
    expect(screen.queryByText("In refinement: 2026-06-02")).toBeNull();
  });

  it("stays open when the pointer bridges from trigger to card", () => {
    const { trigger } = renderTrigger();
    open(trigger);
    fireEvent.mouseLeave(trigger);
    const card = screen.getByRole("dialog");
    fireEvent.mouseEnter(card); // cancels the scheduled close
    act(() => { vi.advanceTimersByTime(250); });
    expect(screen.getByText("In refinement: 2026-06-02")).toBeInTheDocument();
  });

  it("invokes onRemoveFromRefinement with the session id and ticket key", () => {
    const onRemove = vi.fn();
    const { trigger } = renderTrigger({ onRemoveFromRefinement: onRemove });
    open(trigger);
    fireEvent.click(screen.getByLabelText("Remove VPL-483 from In refinement: 2026-06-02"));
    expect(onRemove).toHaveBeenCalledWith("s1", "VPL-483");
  });

  it("calls onViewRefinement from the View refinement button", () => {
    const onView = vi.fn();
    const { trigger } = renderTrigger({ onViewRefinement: onView });
    open(trigger);
    fireEvent.click(screen.getByRole("button", { name: /view refinement/i }));
    expect(onView).toHaveBeenCalledWith("s1");
  });

  it("caps long lists and shows a +N more link to the session", () => {
    const keys = Array.from({ length: 11 }, (_, i) => `VPL-${i + 1}`);
    const { trigger } = renderTrigger({ sessions: [session({ ticketKeys: keys })], currentKey: "VPL-1" });
    open(trigger);
    // 8 visible + a "+3 more" affordance.
    const more = screen.getByText("+3 more in this refinement");
    expect(more.closest("a")?.getAttribute("href")).toBe("/refinement/s1");
    expect(screen.queryByText("VPL-9")).toBeNull();
  });

  it("renders one section per session for multi-session tickets", () => {
    const sessions = [
      session({ id: "s1", name: "Session One" }),
      session({ id: "s2", name: "Session Two", ticketKeys: ["VPL-482", "VPL-900"] }),
    ];
    const { trigger } = renderTrigger({ sessions });
    open(trigger);
    expect(screen.getByText("Session One")).toBeInTheDocument();
    expect(screen.getByText("Session Two")).toBeInTheDocument();
    expect(screen.getAllByText("View refinement")).toHaveLength(2);
  });
});
