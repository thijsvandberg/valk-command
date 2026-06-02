import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SessionNavigation, type SessionNavigationProps } from "./SessionNavigation";

function renderNav(overrides: Partial<SessionNavigationProps> = {}) {
  const props: SessionNavigationProps = {
    currentIndex: 0,
    queue: ["VPL-1", "VPL-2", "VPL-3", "VPL-4"],
    queueMeta: [],
    allTickets: undefined,
    isLastTicket: false,
    storyPoints: 2,
    onStoryPointsChange: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onGoToTicket: vi.fn(),
    onReorderQueue: vi.fn(),
    ...overrides,
  };
  render(<SessionNavigation {...props} />);
  return props;
}

describe("SessionNavigation", () => {
  it("shows the ticket counter", () => {
    renderNav();
    expect(screen.getByText("Ticket 1 of 4")).toBeInTheDocument();
  });

  it("renders the story point picker with the current value", () => {
    renderNav({ storyPoints: 2 });
    // The picker trigger displays the value; "2" does not appear in the
    // counter ("Ticket 1 of 4"), so this uniquely identifies the picker.
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("opens the picker and reports a new estimate via onStoryPointsChange", () => {
    const { onStoryPointsChange } = renderNav({ storyPoints: 2 });
    fireEvent.click(screen.getByText("2"));
    fireEvent.click(screen.getByText("5"));
    expect(onStoryPointsChange).toHaveBeenCalledWith(5);
  });

  it("calls onPrev when the previous control is clicked", () => {
    const { onPrev } = renderNav({ currentIndex: 1 });
    fireEvent.click(screen.getByLabelText("Previous ticket"));
    expect(onPrev).toHaveBeenCalled();
  });

  it("disables the previous control on the first ticket", () => {
    renderNav({ currentIndex: 0 });
    expect(screen.getByLabelText("Previous ticket")).toBeDisabled();
  });

  it("calls onNext when the next control is clicked", () => {
    const { onNext } = renderNav({ isLastTicket: false });
    fireEvent.click(screen.getByLabelText("Next ticket"));
    expect(onNext).toHaveBeenCalled();
  });

  it("labels the next control as End session on the last ticket", () => {
    renderNav({ isLastTicket: true });
    expect(screen.getByLabelText("End session")).toBeInTheDocument();
  });
});
