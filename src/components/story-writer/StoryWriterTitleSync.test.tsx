import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/hooks/useTicketEvents", () => ({ useTicketEvents: vi.fn() }));
vi.mock("@/hooks/useStoryWriter", () => ({ useStoryWriter: vi.fn() }));
vi.mock("@/hooks/useNotification", () => ({ useNotification: () => ({ notify: vi.fn() }) }));
vi.mock("@/hooks/useOutsideClick", () => ({ useOutsideClick: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("swr", () => {
  const mutate = vi.fn();
  return { mutate, useSWRConfig: () => ({ mutate }) };
});
vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: vi.fn().mockResolvedValue({}),
  jira: {},
  tickets: {
    get: vi.fn().mockResolvedValue({ title: "t" }),
    pullFromJira: vi.fn().mockResolvedValue({}),
    updateMetadata: vi.fn().mockResolvedValue({}),
  },
}));

import { useStoryWriterActions } from "./useStoryWriterActions";

interface TitleProps {
  effectiveKey: string;
  localTitle?: string | null;
  ticketTitle?: string | null;
  draftTitle?: string;
}

function makeWriter(localTitle: string | null | undefined) {
  return {
    session: { localDraft: "draft body", localTitle: localTitle ?? null, targetTicketKey: null },
    status: "ready",
    messages: [],
    aiDrafts: [],
    targetAiDrafts: [],
    relatedCandidates: [],
    outdated: false,
    targetOutdated: false,
    refreshSession: vi.fn().mockResolvedValue(undefined),
    saveDraft: vi.fn().mockResolvedValue(undefined),
    pushToJira: vi.fn().mockResolvedValue({ success: true, conflict: false, contentChanged: false }),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    updateLocalDraft: vi.fn(),
    updateLocalTitle: vi.fn(),
    updateTargetLocalDraft: vi.fn(),
    updateTargetLocalTitle: vi.fn(),
  } as unknown as Parameters<typeof useStoryWriterActions>[0]["writer"];
}

function useTitleSyncUnderTest(props: TitleProps) {
  return useStoryWriterActions({
    ticketKey: props.effectiveKey,
    writer: makeWriter(props.localTitle),
    ticketData: { description: "jira body", title: props.ticketTitle ?? null },
    mutateTicket: vi.fn(),
    draftTitle: props.draftTitle,
    isDraft: false,
    isStillDraft: false,
    effectiveKey: props.effectiveKey,
  });
}

function renderTitleSync(initialProps: TitleProps) {
  return renderHook((props: TitleProps) => useTitleSyncUnderTest(props), {
    initialProps,
  });
}

beforeEach(() => {
  document.title = "";
});

describe("StoryWriter title sync (useStoryWriterActions)", () => {
  it("sets document.title with draft key when no title is set", () => {
    renderTitleSync({ effectiveKey: "DRAFT-abc123" });
    expect(document.title).toBe("DRAFT-abc123 - Story Writer | Bridge");
  });

  it("includes the localTitle when set", () => {
    renderTitleSync({
      effectiveKey: "DRAFT-abc123",
      localTitle: "Add user authentication",
    });
    expect(document.title).toBe(
      "DRAFT-abc123 - Add user authentication - Story Writer | Bridge",
    );
  });

  it("falls back to ticket title when localTitle is null", () => {
    renderTitleSync({
      effectiveKey: "VPL-42",
      localTitle: null,
      ticketTitle: "Jira ticket title",
    });
    expect(document.title).toBe(
      "VPL-42 - Jira ticket title - Story Writer | Bridge",
    );
  });

  it("falls back to draftTitle when localTitle and ticket title are null", () => {
    renderTitleSync({
      effectiveKey: "DRAFT-xyz",
      localTitle: null,
      ticketTitle: null,
      draftTitle: "URL draft title",
    });
    expect(document.title).toBe(
      "DRAFT-xyz - URL draft title - Story Writer | Bridge",
    );
  });

  it("ignores 'Untitled draft' as a title", () => {
    renderTitleSync({
      effectiveKey: "DRAFT-abc123",
      localTitle: "Untitled draft",
    });
    expect(document.title).toBe("DRAFT-abc123 - Story Writer | Bridge");
  });

  it("prefers localTitle over ticket title", () => {
    renderTitleSync({
      effectiveKey: "VPL-42",
      localTitle: "Updated title from writer",
      ticketTitle: "Original Jira title",
    });
    expect(document.title).toBe(
      "VPL-42 - Updated title from writer - Story Writer | Bridge",
    );
  });

  it("updates document.title when localTitle changes", () => {
    const { rerender } = renderTitleSync({
      effectiveKey: "DRAFT-abc123",
      localTitle: null,
    });

    expect(document.title).toBe("DRAFT-abc123 - Story Writer | Bridge");

    rerender({
      effectiveKey: "DRAFT-abc123",
      localTitle: "New title from AI",
    });

    expect(document.title).toBe(
      "DRAFT-abc123 - New title from AI - Story Writer | Bridge",
    );
  });

  it("updates key when draft gets a real Jira key", () => {
    const { rerender } = renderTitleSync({
      effectiveKey: "DRAFT-abc123",
      localTitle: "My story",
    });

    expect(document.title).toBe(
      "DRAFT-abc123 - My story - Story Writer | Bridge",
    );

    rerender({
      effectiveKey: "VPL-99",
      localTitle: "My story",
    });

    expect(document.title).toBe(
      "VPL-99 - My story - Story Writer | Bridge",
    );
  });
});
