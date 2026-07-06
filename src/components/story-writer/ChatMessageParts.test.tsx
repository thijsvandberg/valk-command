import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Message } from "@/types/chat";
import { parseLinkSuggestions, stripLinkSuggestionTags, parseEpicSuggestions, stripEpicSuggestionTags, parseInvestigation, stripInvestigationTags, ChatMessage, DraftCard } from "./ChatMessageParts";

// Capture the linkifyRefs option so call-site tests can assert the flag is
// threaded into the body vs. left off the draft preview. The pill rendering
// itself is covered by renderMarkdown.test.tsx.
vi.mock("@/components/ticket-detail/renderMarkdown", () => ({
  renderMarkdown: (content: string, opts?: { linkifyRefs?: boolean }) => (
    <span data-testid="markdown" data-linkify={opts?.linkifyRefs ? "true" : "false"}>{content}</span>
  ),
}));

// Sibling components and the api client drag in SWR/hover data; stub them so
// these render tests stay focused on the markdown call sites.
vi.mock("@/lib/api-client", () => ({ tickets: { detailUrl: (k: string) => `/api/tickets/${k}` } }));
vi.mock("@/components/shared/TicketStatusPill", () => ({ TicketStatusPill: () => <span /> }));
vi.mock("./TitleSuggestionChips", () => ({ TitleSuggestionChips: () => <div /> }));
vi.mock("./TypeSuggestionChip", () => ({ TypeSuggestionChip: () => <div /> }));
vi.mock("./LinkSuggestionChips", () => ({ LinkSuggestionChips: () => <div /> }));
vi.mock("./EpicSuggestionCard", () => ({ EpicSuggestionCard: () => <div /> }));
vi.mock("./InvestigationSuggestionCard", () => ({
  InvestigationSuggestionCard: ({ result }: { result: string }) => (
    <div data-testid="investigation-card">{result}</div>
  ),
}));
vi.mock("./SuggestionCard", () => ({
  SuggestionCard: () => <div />,
  SuggestionRow: () => <div />,
  ScoreBadge: () => <div />,
  LinkButton: () => <div />,
  AppliedBadge: () => <div />,
}));

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "m-1",
    conversationId: "c-1",
    role: "assistant",
    content: "See VPL-123 for context.",
    timestamp: "2026-01-01T10:00:00Z",
    workspaceTaskId: null,
    ...overrides,
  };
}

describe("ChatMessage ticket-reference linkification", () => {
  it("linkifies ticket references in the chat message body", () => {
    render(<ChatMessage message={makeMessage()} />);
    expect(screen.getByText("See VPL-123 for context.")).toHaveAttribute("data-linkify", "true");
  });

  it("linkifies the 'Current draft' card preview (BRDG-253)", () => {
    render(<DraftCard content="Draft mentions VPL-456" />);
    fireEvent.click(screen.getByText("Current draft"));
    expect(screen.getByText("Draft mentions VPL-456")).toHaveAttribute("data-linkify", "true");
  });

  it("linkifies the chat draft expander preview (BRDG-253)", () => {
    render(<ChatMessage message={makeMessage({ content: "" })} draftId="d-1" draftContent="Draft mentions VPL-789" />);
    fireEvent.click(screen.getByText("Draft updated"));
    expect(screen.getByText("Draft mentions VPL-789")).toHaveAttribute("data-linkify", "true");
  });

  it("strips the <related-request> signal tag from the displayed message (BRDG-397)", () => {
    render(<ChatMessage message={makeMessage({ content: 'Looking now. <related-request query="x" sprint="139" /> done' })} />);
    const body = screen.getByTestId("markdown");
    expect(body.textContent).not.toContain("related-request");
    expect(body.textContent).toContain("Looking now.");
    expect(body.textContent).toContain("done");
  });
});

describe("ChatMessage long-text overflow (BRDG-261)", () => {
  const LONG_URL =
    "https://uat1-booking-v5.vandervalkonline.com/hotelluxembourgarlon/configuration?occupancy=%5B%7B%22adults%22:1%7D%5D&dealGUID=c1d0f0ca-3828-4389-9b0e-9a9948637b05";

  it("renders a long unbreakable string inside the min-w-0 bubble wrapper so it can wrap", () => {
    const { container } = render(<ChatMessage message={makeMessage({ content: LONG_URL })} />);
    // The bubble wrapper must allow shrinking below its content's intrinsic
    // width (min-w-0); otherwise the long token pushes past the max-w cap.
    const wrapper = container.querySelector(".min-w-0");
    expect(wrapper).not.toBeNull();
    const markdown = screen.getByTestId("markdown");
    expect(markdown).toHaveTextContent(LONG_URL);
    expect(wrapper).toContainElement(markdown);
  });

  it("places the content in a chat-markdown block (which wraps long strings via CSS)", () => {
    const { container } = render(<ChatMessage message={makeMessage({ content: LONG_URL })} />);
    const markup = container.querySelector(".chat-markdown");
    expect(markup).not.toBeNull();
    expect(markup).toContainElement(screen.getByTestId("markdown"));
  });
});

describe("parseLinkSuggestions", () => {
  it("parses a single link-suggestion tag", () => {
    const content = 'Some text <link-suggestion key="VPL-123" relation="relates to" /> more text';
    const result = parseLinkSuggestions(content);
    expect(result).toEqual([{ key: "VPL-123", relation: "relates to" }]);
  });

  it("parses multiple single link-suggestion tags", () => {
    const content =
      '<link-suggestion key="VPL-1" relation="blocks" /> and <link-suggestion key="VPL-2" relation="is blocked by" />';
    const result = parseLinkSuggestions(content);
    expect(result).toEqual([
      { key: "VPL-1", relation: "blocks" },
      { key: "VPL-2", relation: "is blocked by" },
    ]);
  });

  it("parses link-suggestions multi-tag format", () => {
    const content = `Here are some links:
<link-suggestions>
<link key="VPL-100" relation="relates to" />
<link key="BRDG-045" relation="is blocked by" />
</link-suggestions>
Done.`;
    const result = parseLinkSuggestions(content);
    expect(result).toEqual([
      { key: "VPL-100", relation: "relates to" },
      { key: "BRDG-045", relation: "is blocked by" },
    ]);
  });

  it("deduplicates keys across multi and single tags", () => {
    const content =
      '<link-suggestions><link key="VPL-1" relation="blocks" /></link-suggestions> <link-suggestion key="VPL-1" relation="relates to" />';
    const result = parseLinkSuggestions(content);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("VPL-1");
  });

  it("defaults invalid relation to 'relates to'", () => {
    const content = '<link-suggestion key="VPL-1" relation="invalid-relation" />';
    const result = parseLinkSuggestions(content);
    expect(result).toEqual([{ key: "VPL-1", relation: "relates to" }]);
  });

  it("returns empty array for content with no link tags", () => {
    const content = "Just some text without any link suggestions.";
    expect(parseLinkSuggestions(content)).toEqual([]);
  });

  it("returns empty array for user messages (function only parses content string)", () => {
    const content = '<link-suggestion key="VPL-1" relation="relates to" />';
    // The function itself parses any content; the caller gates on role
    expect(parseLinkSuggestions(content)).toEqual([{ key: "VPL-1", relation: "relates to" }]);
  });

  it("handles all valid relation types", () => {
    const relations = [
      "relates to",
      "blocks",
      "is blocked by",
      "clones",
      "is cloned by",
      "duplicates",
      "is duplicated by",
    ];
    for (const rel of relations) {
      const content = `<link-suggestion key="X-1" relation="${rel}" />`;
      const result = parseLinkSuggestions(content);
      expect(result[0].relation).toBe(rel);
    }
  });
});

describe("stripLinkSuggestionTags", () => {
  it("strips single link-suggestion tags", () => {
    const input = 'before <link-suggestion key="VPL-1" relation="relates to" /> after';
    expect(stripLinkSuggestionTags(input)).toBe("before  after");
  });

  it("strips link-suggestions multi-tag block", () => {
    const input = `text
<link-suggestions>
<link key="VPL-1" relation="blocks" />
</link-suggestions>
more text`;
    const result = stripLinkSuggestionTags(input);
    expect(result).not.toContain("link-suggestions");
    expect(result).toContain("text");
    expect(result).toContain("more text");
  });

  it("strips both formats in the same content", () => {
    const input =
      '<link-suggestions><link key="A-1" relation="blocks" /></link-suggestions> and <link-suggestion key="B-2" relation="relates to" />';
    const result = stripLinkSuggestionTags(input);
    expect(result.trim()).toBe("and");
  });

  it("returns content unchanged when no tags present", () => {
    const input = "No tags here.";
    expect(stripLinkSuggestionTags(input)).toBe(input);
  });
});

describe("parseEpicSuggestions", () => {
  it("parses XML epic-suggestion format", () => {
    const content = `Here is the suggestion:
<epic-suggestion>
<epic key="VPL-10" confidence="high" reason="Covers group booking" />
<epic key="VPL-20" confidence="medium" reason="Could relate to online booking" />
</epic-suggestion>`;
    const result = parseEpicSuggestions(content);
    expect(result).toEqual([
      { key: "VPL-10", name: "VPL-10", confidence: "high", reason: "Covers group booking" },
      { key: "VPL-20", name: "VPL-20", confidence: "medium", reason: "Could relate to online booking" },
    ]);
  });

  it("parses json-output format with epic data", () => {
    const content = `<json-output>[{"key":"VPL-10","name":"Group Reservations","confidence":"high","reason":"Same domain"}]</json-output>`;
    const result = parseEpicSuggestions(content);
    expect(result).toEqual([
      { key: "VPL-10", name: "Group Reservations", confidence: "high", reason: "Same domain" },
    ]);
  });

  it("defaults invalid confidence to low", () => {
    const content = `<json-output>[{"key":"VPL-1","name":"Test","confidence":"very-high","reason":"test"}]</json-output>`;
    const result = parseEpicSuggestions(content);
    expect(result[0].confidence).toBe("low");
  });

  it("deduplicates by key", () => {
    const content = `<json-output>[{"key":"VPL-1","name":"A","confidence":"high","reason":"r1"},{"key":"VPL-1","name":"A","confidence":"medium","reason":"r2"}]</json-output>`;
    const result = parseEpicSuggestions(content);
    expect(result).toHaveLength(1);
  });

  it("returns empty array for content without epic tags", () => {
    expect(parseEpicSuggestions("Just text")).toEqual([]);
  });

  it("returns empty array for invalid JSON in json-output", () => {
    const content = "<json-output>not valid json</json-output>";
    expect(parseEpicSuggestions(content)).toEqual([]);
  });

  it("prefers XML format over JSON when XML is present", () => {
    const content = `<epic-suggestion><epic key="VPL-1" confidence="high" reason="xml reason" /></epic-suggestion><json-output>[{"key":"VPL-2","name":"B","confidence":"low","reason":"json reason"}]</json-output>`;
    const result = parseEpicSuggestions(content);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("VPL-1");
  });
});

describe("parseInvestigation (BRDG-435)", () => {
  it("extracts the inner investigation result", () => {
    const content = "Here are my findings.\n<investigation>## Findings\n\n- one\n- two</investigation>\nDone.";
    expect(parseInvestigation(content)).toBe("## Findings\n\n- one\n- two");
  });

  it("returns null when there is no investigation tag", () => {
    expect(parseInvestigation("Just some text without a tag.")).toBeNull();
  });

  it("returns null for an empty investigation block", () => {
    expect(parseInvestigation("<investigation>   </investigation>")).toBeNull();
  });
});

describe("stripInvestigationTags (BRDG-435)", () => {
  it("removes the investigation block", () => {
    const input = "before <investigation>secret report</investigation> after";
    expect(stripInvestigationTags(input)).toBe("before  after");
  });

  it("returns content unchanged when no tag present", () => {
    expect(stripInvestigationTags("No tags here.")).toBe("No tags here.");
  });
});

describe("ChatMessage investigation rendering (BRDG-435)", () => {
  it("strips the raw <investigation> tag from the displayed message body", () => {
    render(
      <ChatMessage
        message={makeMessage({
          content: "Looking into it. <investigation>## Findings\n\nDetails here</investigation> Done.",
        })}
      />,
    );
    const body = screen.getByTestId("markdown");
    expect(body.textContent).not.toContain("investigation");
    expect(body.textContent).not.toContain("Details here");
    expect(body.textContent).toContain("Looking into it.");
    expect(body.textContent).toContain("Done.");
  });

  it("renders the investigation result as a suggestion card when a post handler is provided", () => {
    render(
      <ChatMessage
        message={makeMessage({ content: "<investigation>## Findings\n\nDetails here</investigation>" })}
        onPostInvestigation={async () => {}}
      />,
    );
    expect(screen.getByTestId("investigation-card")).toHaveTextContent("Details here");
  });

  it("does not render the card without a post handler", () => {
    render(
      <ChatMessage
        message={makeMessage({ content: "<investigation>## Findings</investigation>" })}
      />,
    );
    expect(screen.queryByTestId("investigation-card")).toBeNull();
  });
});

describe("ChatMessage epic-writer tag stripping (BRDG-478)", () => {
  it("strips <epic-breakdown> from the displayed body but keeps commentary", () => {
    render(
      <ChatMessage
        message={makeMessage({
          content: 'Here is a first cut. <epic-breakdown>[{"title":"A"}]</epic-breakdown>',
        })}
      />,
    );
    const body = screen.getByTestId("markdown");
    expect(body.textContent).not.toContain("epic-breakdown");
    expect(body.textContent).not.toContain("title");
    expect(body.textContent).toContain("Here is a first cut.");
  });

  it("strips <epic-questions>, <story-detail> and <sprint-plan> blocks", () => {
    render(
      <ChatMessage
        message={makeMessage({
          content:
            "Intro. <epic-questions>q</epic-questions> <story-detail>d</story-detail> <sprint-plan>s</sprint-plan> Outro.",
        })}
      />,
    );
    const body = screen.getByTestId("markdown");
    expect(body.textContent).not.toContain("epic-questions");
    expect(body.textContent).not.toContain("story-detail");
    expect(body.textContent).not.toContain("sprint-plan");
    expect(body.textContent).toContain("Intro.");
    expect(body.textContent).toContain("Outro.");
  });
});

describe("ChatMessage empty-bubble suppression (BRDG-478)", () => {
  it("renders nothing when an assistant message is only an <html-report>", () => {
    const { container } = render(
      <ChatMessage
        message={makeMessage({ content: `<html-report>${"x".repeat(100)}</html-report>` })}
      />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("markdown")).toBeNull();
  });

  it("renders nothing when an assistant message is only an <epic-breakdown>", () => {
    const { container } = render(
      <ChatMessage
        message={makeMessage({ content: '<epic-breakdown>[{"title":"A"}]</epic-breakdown>' })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("still renders a draft-only assistant message (has draftId)", () => {
    render(<ChatMessage message={makeMessage({ content: "" })} draftId="d-1" draftContent="Some draft" />);
    expect(screen.queryByText("Draft updated")).not.toBeNull();
  });

  it("still renders a cancelled empty assistant message so its badge shows", () => {
    render(<ChatMessage message={makeMessage({ content: "<html-report>big</html-report>", cancelled: true })} />);
    expect(screen.queryByTestId("cancelled-badge")).not.toBeNull();
  });

  it("still renders a normal assistant message", () => {
    render(<ChatMessage message={makeMessage({ content: "Just commentary." })} />);
    expect(screen.queryByText("Just commentary.")).not.toBeNull();
  });

  it("does not suppress an empty user message bubble", () => {
    // Suppression is assistant-only; user rows are handled elsewhere.
    const { container } = render(
      <ChatMessage message={makeMessage({ role: "user", content: "<html-report>x</html-report>" })} />,
    );
    expect(container.firstChild).not.toBeNull();
  });
});

describe("ChatMessage accepted-draft persistence (BRDG-483)", () => {
  it("shows the Accepted badge and hides the Accept button when accepted is derived true", () => {
    render(
      <ChatMessage
        message={makeMessage({ content: "" })}
        draftId="d-1"
        draftContent="Accepted body"
        isLatestDraft
        accepted
        onAcceptDraft={vi.fn()}
      />,
    );
    // Accepted drafts collapse by default; expand to confirm no Accept button.
    fireEvent.click(screen.getByText("Draft updated"));
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.queryByText("Accept draft")).toBeNull();
  });

  it("still offers the Accept button on a not-yet-accepted draft", () => {
    render(
      <ChatMessage
        message={makeMessage({ content: "" })}
        draftId="d-1"
        draftContent="Fresh body"
        isLatestDraft
        accepted={false}
        onAcceptDraft={vi.fn()}
      />,
    );
    expect(screen.getByText("Accept draft")).toBeInTheDocument();
    expect(screen.queryByText("Accepted")).toBeNull();
  });

  it("optimistically flips to Accepted on click before the derived value catches up", () => {
    const onAcceptDraft = vi.fn();
    render(
      <ChatMessage
        message={makeMessage({ content: "" })}
        draftId="d-1"
        draftContent="Body to accept"
        isLatestDraft
        accepted={false}
        onAcceptDraft={onAcceptDraft}
      />,
    );
    fireEvent.click(screen.getByText("Accept draft"));
    expect(onAcceptDraft).toHaveBeenCalledWith("d-1");
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.queryByText("Accept draft")).toBeNull();
  });
});

describe("stripEpicSuggestionTags", () => {
  it("strips epic-suggestion XML tags", () => {
    const input = `before <epic-suggestion><epic key="VPL-1" confidence="high" reason="r" /></epic-suggestion> after`;
    const result = stripEpicSuggestionTags(input);
    expect(result).toBe("before  after");
  });

  it("strips json-output blocks that contain epic data", () => {
    const input = `text <json-output>[{"key":"VPL-1","name":"A","confidence":"high","reason":"r"}]</json-output> more`;
    const result = stripEpicSuggestionTags(input);
    expect(result).toBe("text  more");
  });

  it("preserves json-output blocks without epic data", () => {
    const input = `text <json-output>{"summary":"hello"}</json-output> more`;
    const result = stripEpicSuggestionTags(input);
    expect(result).toContain("json-output");
  });

  it("returns content unchanged when no tags present", () => {
    const input = "No tags here.";
    expect(stripEpicSuggestionTags(input)).toBe(input);
  });
});
