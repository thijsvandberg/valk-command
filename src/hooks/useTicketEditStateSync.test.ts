import { describe, it, expect, vi } from "vitest";
import type { ScopedMutator } from "swr";
import { patchTicketEditStateCaches } from "./useTicketEditStateSync";
import type { Ticket } from "@/types/ticket";

describe("patchTicketEditStateCaches", () => {
  it("patches the detail cache and clears localEdits when clean", () => {
    const mutate = vi.fn() as unknown as ScopedMutator;
    patchTicketEditStateCaches(mutate, "VPL-1", "clean");

    const [detailKey, detailUpdater] = (mutate as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(detailKey).toBe("/api/tickets/VPL-1");
    const prev = { key: "VPL-1", editState: "draft", localEdits: { description: { value: "x", isDraft: true } } };
    expect(detailUpdater(prev)).toMatchObject({ editState: "clean", localEdits: {} });
  });

  it("keeps localEdits on the detail cache when the state is not clean", () => {
    const mutate = vi.fn() as unknown as ScopedMutator;
    patchTicketEditStateCaches(mutate, "VPL-1", "local_edits");

    const [, detailUpdater] = (mutate as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const prev = { key: "VPL-1", editState: "draft", localEdits: { title: { value: "t", isDraft: false } } };
    expect(detailUpdater(prev)).toMatchObject({
      editState: "local_edits",
      localEdits: { title: { value: "t", isDraft: false } },
    });
  });

  it("matches only list keys and updates the target ticket in place", () => {
    const mutate = vi.fn() as unknown as ScopedMutator;
    patchTicketEditStateCaches(mutate, "VPL-2", "local_edits");

    const [listFilter, listUpdater] = (mutate as unknown as ReturnType<typeof vi.fn>).mock.calls[1];
    // The filter targets the list endpoints, never the detail key (which has a path segment).
    expect(listFilter("/api/tickets")).toBe(true);
    expect(listFilter("/api/tickets?sprintId=42")).toBe(true);
    expect(listFilter("/api/tickets/VPL-2")).toBe(false);

    const list: Ticket[] = [
      { key: "VPL-1", editState: "clean" } as Ticket,
      { key: "VPL-2", editState: "clean" } as Ticket,
    ];
    const next = listUpdater(list) as Ticket[];
    expect(next.find((t) => t.key === "VPL-2")?.editState).toBe("local_edits");
    expect(next.find((t) => t.key === "VPL-1")?.editState).toBe("clean");
  });
});
