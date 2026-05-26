import { renderHook } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useEffect } from "react";
import { PAGE_TITLE_SUFFIX } from "@/hooks/usePageTitle";

/**
 * Replicates the title sync logic from StoryWriterLayout to test
 * that document.title updates correctly as localTitle changes.
 */
function useTitleSync(opts: {
  effectiveKey: string;
  localTitle?: string | null;
  ticketTitle?: string | null;
  draftTitle?: string;
}) {
  const resolvedTitle = opts.localTitle ?? opts.ticketTitle ?? opts.draftTitle;
  const pageTitle =
    resolvedTitle && resolvedTitle !== "Untitled draft"
      ? `${opts.effectiveKey} - ${resolvedTitle} - Story Writer${PAGE_TITLE_SUFFIX}`
      : `${opts.effectiveKey} - Story Writer${PAGE_TITLE_SUFFIX}`;

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  return pageTitle;
}

beforeEach(() => {
  document.title = "";
});

describe("StoryWriter title sync", () => {
  it("sets document.title with draft key when no title is set", () => {
    renderHook(() =>
      useTitleSync({ effectiveKey: "DRAFT-abc123" }),
    );
    expect(document.title).toBe("DRAFT-abc123 - Story Writer | Bridge");
  });

  it("includes the localTitle when set", () => {
    renderHook(() =>
      useTitleSync({
        effectiveKey: "DRAFT-abc123",
        localTitle: "Add user authentication",
      }),
    );
    expect(document.title).toBe(
      "DRAFT-abc123 - Add user authentication - Story Writer | Bridge",
    );
  });

  it("falls back to ticketTitle when localTitle is null", () => {
    renderHook(() =>
      useTitleSync({
        effectiveKey: "VPL-42",
        localTitle: null,
        ticketTitle: "Jira ticket title",
      }),
    );
    expect(document.title).toBe(
      "VPL-42 - Jira ticket title - Story Writer | Bridge",
    );
  });

  it("falls back to draftTitle when localTitle and ticketTitle are null", () => {
    renderHook(() =>
      useTitleSync({
        effectiveKey: "DRAFT-xyz",
        localTitle: null,
        ticketTitle: null,
        draftTitle: "URL draft title",
      }),
    );
    expect(document.title).toBe(
      "DRAFT-xyz - URL draft title - Story Writer | Bridge",
    );
  });

  it("ignores 'Untitled draft' as a title", () => {
    renderHook(() =>
      useTitleSync({
        effectiveKey: "DRAFT-abc123",
        localTitle: "Untitled draft",
      }),
    );
    expect(document.title).toBe("DRAFT-abc123 - Story Writer | Bridge");
  });

  it("prefers localTitle over ticketTitle", () => {
    renderHook(() =>
      useTitleSync({
        effectiveKey: "VPL-42",
        localTitle: "Updated title from writer",
        ticketTitle: "Original Jira title",
      }),
    );
    expect(document.title).toBe(
      "VPL-42 - Updated title from writer - Story Writer | Bridge",
    );
  });

  it("updates document.title when localTitle changes", () => {
    const { rerender } = renderHook(
      (props: Parameters<typeof useTitleSync>[0]) => useTitleSync(props),
      {
        initialProps: {
          effectiveKey: "DRAFT-abc123",
          localTitle: null as string | null,
        },
      },
    );

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
    const { rerender } = renderHook(
      (props: Parameters<typeof useTitleSync>[0]) => useTitleSync(props),
      {
        initialProps: {
          effectiveKey: "DRAFT-abc123",
          localTitle: "My story",
        },
      },
    );

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
