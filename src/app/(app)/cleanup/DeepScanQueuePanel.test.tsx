import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeepScanQueuePanel, type QueueData, type QueueItem } from "./DeepScanQueuePanel";

// The pill pulls in hover-data context; stub it to a plain key so the queue test
// stays focused on list rendering and the remove/clear wiring.
vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ ticketKey }: { ticketKey: string }) => <span>{ticketKey}</span>,
}));

vi.mock("@/lib/date-utils", () => ({
  relativeDate: () => "2h ago",
}));

function item(over: Partial<QueueItem> & Pick<QueueItem, "id" | "jiraKey" | "status">): QueueItem {
  return {
    source: "manual",
    enqueuedAt: "2026-06-05T00:00:00Z",
    startedAt: null,
    finishedAt: null,
    error: null,
    title: `Title ${over.jiraKey}`,
    ticketStatus: "TO DO",
    ...over,
  };
}

const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function queue(items: QueueItem[]): QueueData {
  return {
    pending: items.filter((i) => i.status === "pending").length,
    running: items.filter((i) => i.status === "running").length,
    done: items.filter((i) => i.status === "done").length,
    error: items.filter((i) => i.status === "error").length,
    items,
  };
}

function openPanel() {
  // The trigger's accessible name is its visible counts text; select it by its
  // popup role instead so the test does not depend on the live count string.
  const trigger = screen
    .getAllByRole("button")
    .find((b) => b.getAttribute("aria-haspopup") === "dialog");
  if (!trigger) throw new Error("queue trigger not found");
  fireEvent.click(trigger);
}

describe("DeepScanQueuePanel", () => {
  it("renders nothing when the queue has no activity", () => {
    const { container } = render(
      <DeepScanQueuePanel queue={{ pending: 0, running: 0, done: 0, error: 0, items: [] }} onMutate={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders each item with a status treatment", () => {
    const items = [
      item({ id: "1", jiraKey: "BT-1", status: "pending" }),
      item({ id: "2", jiraKey: "BT-2", status: "running" }),
      item({ id: "3", jiraKey: "BT-3", status: "done" }),
      item({ id: "4", jiraKey: "BT-4", status: "error", error: "boom" }),
    ];
    render(<DeepScanQueuePanel queue={queue(items)} onMutate={() => {}} />);
    openPanel();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("shows a remove control only on pending items", () => {
    const items = [
      item({ id: "1", jiraKey: "BT-1", status: "pending" }),
      item({ id: "2", jiraKey: "BT-2", status: "running" }),
    ];
    render(<DeepScanQueuePanel queue={queue(items)} onMutate={() => {}} />);
    openPanel();
    expect(screen.getByRole("button", { name: /Remove BT-1 from the queue/i })).toBeInTheDocument();
    // Running items are not removable.
    expect(screen.queryByRole("button", { name: /Remove BT-2 from the queue/i })).not.toBeInTheDocument();
  });

  it("removing a pending item calls DELETE with the key", async () => {
    const onMutate = vi.fn();
    render(
      <DeepScanQueuePanel queue={queue([item({ id: "1", jiraKey: "BT-1", status: "pending" })])} onMutate={onMutate} />,
    );
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: /Remove BT-1 from the queue/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/cleanup/deep-scan");
    expect(opts.method).toBe("DELETE");
    expect(JSON.parse(opts.body)).toEqual({ key: "BT-1" });
    await waitFor(() => expect(onMutate).toHaveBeenCalled());
  });

  it("clear pending calls DELETE with all:true", async () => {
    const onMutate = vi.fn();
    render(
      <DeepScanQueuePanel queue={queue([item({ id: "1", jiraKey: "BT-1", status: "pending" })])} onMutate={onMutate} />,
    );
    openPanel();
    const dialog = screen.getByRole("dialog", { name: /Deep-scan queue/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /Clear pending/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe("DELETE");
    expect(JSON.parse(opts.body)).toEqual({ all: true });
    await waitFor(() => expect(onMutate).toHaveBeenCalled());
  });
});
