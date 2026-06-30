import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StatusChangeLine, describeDeploy } from "./StatusChangeLine";
import type { StatusChangeItem } from "@/lib/status-changes-query";
import type { LastDeployedInfo } from "@/hooks/usePipelines";
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
    sprintAdded: null,
    ...overrides,
  };
}

const SPRINT_ADD = {
  id: "scope-VPL-1-add-1",
  changedBy: "Frank van den Nouland",
  changedByAccountId: "acc-frank",
  changedByAvatar: null,
  changedAt: "2026-06-27T10:00:00.000Z",
};

describe("StatusChangeLine (BRDG-414)", () => {
  const noop = () => {};

  it("renders the from -> to transition as one uniform sentence", () => {
    render(<StatusChangeLine change={makeChange()} onSeen={noop} onMoveToBottom={noop} />);
    expect(screen.getByText(/Updated from In Progress to Test/)).toBeInTheDocument();
  });

  it("renders a sprint-add-only line led by 'Added to sprint' with the mover's name (BRDG-439)", () => {
    render(
      <StatusChangeLine
        change={makeChange({ id: null, fromStatus: null, toStatus: null, changedBy: null, sprintAdded: SPRINT_ADD })}
        onSeen={noop}
        onMoveToBottom={noop}
      />,
    );
    expect(screen.getByText(/Added to sprint by Frank van den Nouland/)).toBeInTheDocument();
    expect(screen.queryByText(/Updated from/)).not.toBeInTheDocument();
    expect(screen.queryByText(/moved from/)).not.toBeInTheDocument();
  });

  it("combines a sprint-add with a status change into one sprint-led sentence (BRDG-439)", () => {
    render(
      <StatusChangeLine
        change={makeChange({ fromStatus: "TO DO", toStatus: "IN PROGRESS", changedBy: "Dan Mol", sprintAdded: SPRINT_ADD })}
        onSeen={noop}
        onMoveToBottom={noop}
      />,
    );
    // One combined line; attribution comes from the sprint-add actor, not the status author.
    expect(
      screen.getByText(/Added to sprint and moved from To Do to In Progress by Frank van den Nouland/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Updated from/)).not.toBeInTheDocument();
  });

  it("always shows the changer name, even when it matches the assignee", () => {
    const { rerender } = render(
      <StatusChangeLine
        change={makeChange({ changedBy: "Carol Smit", changedByAccountId: "acc-carol" })}
        onSeen={noop}
        onMoveToBottom={noop}
      />,
    );
    expect(screen.getByText(/by Carol Smit/)).toBeInTheDocument();

    // Same person as the assignee (matched by accountId) -> still shown.
    rerender(
      <StatusChangeLine
        change={makeChange({ changedBy: "Dan Mol", changedByAccountId: "acc-dan" })}
        onSeen={noop}
        onMoveToBottom={noop}
      />,
    );
    expect(screen.getByText(/by Dan Mol/)).toBeInTheDocument();
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

  const deploy: LastDeployedInfo = { environment: "UAT3", state: "SUCCESSFUL", completedAt: "2026-06-25T13:58:00.000Z" };

  it("shows the deploy badge on In Progress changes, not only on Test", () => {
    render(<StatusChangeLine change={makeChange({ toStatus: "IN PROGRESS" })} deploy={deploy} onSeen={noop} onMoveToBottom={noop} />);
    expect(screen.getByText("UAT3")).toBeInTheDocument();
  });

  it("omits the deploy badge when there is no deploy info", () => {
    render(<StatusChangeLine change={makeChange({ toStatus: "IN PROGRESS" })} onSeen={noop} onMoveToBottom={noop} />);
    expect(screen.queryByText("UAT3")).not.toBeInTheDocument();
  });

  it("hides the deploy badge on To Do changes", () => {
    render(<StatusChangeLine change={makeChange({ fromStatus: "TO DO", toStatus: "TO DO" })} deploy={deploy} onSeen={noop} onMoveToBottom={noop} />);
    expect(screen.queryByText("UAT3")).not.toBeInTheDocument();
  });
});

describe("describeDeploy", () => {
  it("phrases a successful deploy as a sentence with a relative 'xx ago' suffix", () => {
    const r = describeDeploy({ environment: "UAT3", state: "SUCCESSFUL", completedAt: "2026-06-25T13:58:00.000Z" });
    expect(r).toMatch(/^Last deployed to UAT3 successfully on .+ \(.+ ago\)\.$/);
    expect(r).not.toContain("SUCCESSFUL");
  });

  it("phrases a failed deploy as a sentence with a relative 'xx ago' suffix", () => {
    const r = describeDeploy({ environment: "UAT3", state: "FAILED", completedAt: "2026-06-25T13:58:00.000Z" });
    expect(r).toMatch(/^The last deploy to UAT3 failed on .+ \(.+ ago\)\.$/);
  });

  it("phrases an in-progress deploy readably and drops the date when missing", () => {
    const r = describeDeploy({ environment: "UAT3", state: "INPROGRESS", completedAt: null });
    expect(r).toBe("Deploy to UAT3 is in progress.");
  });
});
