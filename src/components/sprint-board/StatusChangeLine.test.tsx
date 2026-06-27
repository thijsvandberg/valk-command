import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StatusChangeLine } from "./StatusChangeLine";
import type { StatusChangeItem } from "@/lib/status-changes-query";
import type { Assignee } from "@/types/ticket";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const DAN: Assignee = { name: "Dan Mol", initials: "DM", color: "#3aa67b", accountId: "acc-dan" };

function makeChange(overrides: Partial<StatusChangeItem> = {}): StatusChangeItem {
  return {
    id: "sc-1",
    ticketKey: "VPL-1",
    fromStatus: "IN PROGRESS",
    toStatus: "TEST",
    changedAt: "2026-06-27T10:00:00.000Z",
    changedBy: "Dan Mol",
    changedByAccountId: "acc-dan",
    changedByAvatar: null,
    assignee: DAN,
    openSubtaskCount: 0,
    totalSubtaskCount: 0,
    newCommentCount: 0,
    lastCommentAt: null,
    storyEditedAt: null,
    ...overrides,
  };
}

describe("StatusChangeLine (BRDG-414)", () => {
  const noop = () => {};

  it("renders the from -> to transition", () => {
    render(<StatusChangeLine change={makeChange()} onSeen={noop} onMoveToBottom={noop} />);
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Test")).toBeInTheDocument();
  });

  it("shows the changer only when it differs from the assignee", () => {
    const { rerender } = render(
      <StatusChangeLine
        change={makeChange({ changedBy: "Carol Smit", changedByAccountId: "acc-carol" })}
        onSeen={noop}
        onMoveToBottom={noop}
      />,
    );
    expect(screen.getByText("Carol Smit")).toBeInTheDocument();

    // Same person as the assignee (matched by accountId) -> no "by <name>".
    rerender(
      <StatusChangeLine
        change={makeChange({ changedBy: "Dan Mol", changedByAccountId: "acc-dan" })}
        onSeen={noop}
        onMoveToBottom={noop}
      />,
    );
    expect(screen.queryByText("Dan Mol")).not.toBeInTheDocument();
  });

  it("flags open subtasks only for Done/Deprecated with openSubtaskCount > 0 (reuses OpenSubtasksIndicator)", () => {
    const { rerender } = render(
      <StatusChangeLine
        change={makeChange({ toStatus: "DONE", openSubtaskCount: 2, totalSubtaskCount: 3 })}
        onSeen={noop}
        onMoveToBottom={noop}
      />,
    );
    expect(screen.getByTitle("2 of 3 subtasks still open")).toBeInTheDocument();

    // Done but no open subtasks -> no indicator.
    rerender(
      <StatusChangeLine change={makeChange({ toStatus: "DONE", openSubtaskCount: 0, totalSubtaskCount: 0 })} onSeen={noop} onMoveToBottom={noop} />,
    );
    expect(screen.queryByTitle(/subtasks still open/)).not.toBeInTheDocument();

    // Test status with open subtasks -> no indicator (only Done/Deprecated).
    rerender(
      <StatusChangeLine change={makeChange({ toStatus: "TEST", openSubtaskCount: 3, totalSubtaskCount: 4 })} onSeen={noop} onMoveToBottom={noop} />,
    );
    expect(screen.queryByTitle(/subtasks still open/)).not.toBeInTheDocument();
  });

  it("shows Move to bottom for a finished change plus a dismiss check; only the check otherwise", () => {
    const { rerender } = render(
      <StatusChangeLine change={makeChange({ toStatus: "DONE" })} onSeen={noop} onMoveToBottom={noop} />,
    );
    expect(screen.getByText("Move to bottom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as seen" })).toBeInTheDocument();

    rerender(<StatusChangeLine change={makeChange({ toStatus: "IN PROGRESS" })} onSeen={noop} onMoveToBottom={noop} />);
    expect(screen.queryByText("Move to bottom")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as seen" })).toBeInTheDocument();
  });

  it("hides Move to bottom when the ticket is already filed at the bottom", () => {
    render(<StatusChangeLine change={makeChange({ toStatus: "DONE" })} atBottom onSeen={noop} onMoveToBottom={noop} />);
    expect(screen.queryByText("Move to bottom")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as seen" })).toBeInTheDocument();
  });

  it("shows a new-comment count link when there are recent comments", () => {
    render(
      <StatusChangeLine
        change={makeChange({ newCommentCount: 3, lastCommentAt: "2026-06-27T09:00:00.000Z" })}
        onSeen={noop}
        onMoveToBottom={noop}
      />,
    );
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
