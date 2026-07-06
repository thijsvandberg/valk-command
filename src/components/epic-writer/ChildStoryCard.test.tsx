import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChildStoryCard } from "./ChildStoryCard";
import type { EpicChildCardWithSprint } from "@/types/epic-writer";

// The Create-in-Jira / reassign menu lazy-loads sprints + the default-sprint
// setting when it opens; stub those so the card tests stay isolated from the
// network.
vi.mock("@/lib/api-client", () => ({
  jira: {
    getSprints: vi
      .fn()
      .mockResolvedValue([{ id: "42", name: "Sprint 42", state: "active" }]),
  },
  settings: { getDefaultSprint: vi.fn().mockResolvedValue({ sprintId: "" }) },
}));

// The created-card Jira key now renders as the shared TicketRefPill (BRDG-487 #9),
// which fetches its own ticket detail via SWR. Stub it to a plain key so the card
// tests stay isolated from the network but still assert the key is shown.
vi.mock("@/components/shared/TicketRefPill", () => ({
  TicketRefPill: ({ ticketKey }: { ticketKey: string }) => <span>{ticketKey}</span>,
}));

// The body editor is the shared Tiptap RichEditor (BRDG-490 #6), which does not
// run in jsdom. Stub it as a controlled textarea so the edit flow is testable.
vi.mock("@/components/rich-editor/RichEditor", () => ({
  RichEditor: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      aria-label="body editor"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

function card(overrides: Partial<EpicChildCardWithSprint>): EpicChildCardWithSprint {
  return {
    id: overrides.id ?? "c1",
    sessionId: "sess-1",
    cardIndex: 0,
    title: "Card title",
    bullets: ["a bullet"],
    body: null,
    status: "draft",
    jiraKey: null,
    suggestedSprintId: null,
    suggestedLinks: [],
    liveSprintId: null,
    liveSprintName: null,
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
    ...overrides,
  };
}

describe("ChildStoryCard", () => {
  it("offers a Deepen action and calls back with the card index and title", () => {
    const onDeepen = vi.fn();
    render(<ChildStoryCard card={card({ cardIndex: 2, title: "Cart summary" })} onDeepen={onDeepen} />);

    fireEvent.click(screen.getByRole("button", { name: /deepen/i }));
    expect(onDeepen).toHaveBeenCalledWith(2, "Cart summary");
  });

  // BRDG-490 #7: the action no longer says "Refine" (which collides with the
  // Refine phase name); a worked-out card labels it "Improve".
  it("labels the action Improve once a body exists, never Refine", () => {
    render(<ChildStoryCard card={card({ body: "Worked out" })} onDeepen={vi.fn()} />);
    expect(screen.getByRole("button", { name: /improve/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^deepen$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /refine/i })).not.toBeInTheDocument();
  });

  // BRDG-490 #2: the depth badge and the DRAFT pill are folded into one status.
  it("folds draft state and depth into a single 'Draft · Full' status once a body is filled", () => {
    render(<ChildStoryCard card={card({ body: "Full description" })} />);
    expect(screen.getByText("Draft · Full")).toBeInTheDocument();
    // No separate depth badge remains.
    expect(screen.queryByTitle(/^Depth:/)).not.toBeInTheDocument();
  });

  it("shows a bullets-depth draft as 'Draft · Bullets'", () => {
    render(<ChildStoryCard card={card({ bullets: ["a"], body: null })} />);
    expect(screen.getByText("Draft · Bullets")).toBeInTheDocument();
  });

  it("shows a title-only draft as plain 'Draft'", () => {
    render(<ChildStoryCard card={card({ bullets: [], body: null })} />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("disables the deepen action while a task is busy", () => {
    render(<ChildStoryCard card={card({})} onDeepen={vi.fn()} busy />);
    expect(screen.getByRole("button", { name: /deepen/i })).toBeDisabled();
  });

  // BRDG-490 #6: the detail body renders as formatted markdown (not raw text) and
  // is edited in place with the shared story editor, committed via Save.
  it("renders the detail as markdown and persists a body edit on Save", async () => {
    const onEditCard = vi.fn();
    render(<ChildStoryCard card={card({ cardIndex: 1, body: "**Original**" })} onEditCard={onEditCard} />);

    // Body is collapsed by default; expand it. The markdown is rendered, so the
    // raw asterisks do not appear as literal text.
    fireEvent.click(screen.getByRole("button", { name: /show detail/i }));
    expect(screen.getByText("Original")).toBeInTheDocument();
    expect(screen.queryByText("**Original**")).not.toBeInTheDocument();

    // Open the inline editor, change it, Save to commit.
    fireEvent.click(screen.getByRole("button", { name: /edit detail/i }));
    const editor = await screen.findByRole("textbox", { name: /body editor/i });
    fireEvent.change(editor, { target: { value: "Edited body" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onEditCard).toHaveBeenCalledWith(1, { body: "Edited body" }));
  });

  it("does not persist a body edit that was cancelled", async () => {
    const onEditCard = vi.fn();
    render(<ChildStoryCard card={card({ body: "Same" })} onEditCard={onEditCard} />);
    fireEvent.click(screen.getByRole("button", { name: /show detail/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit detail/i }));
    const editor = await screen.findByRole("textbox", { name: /body editor/i });
    fireEvent.change(editor, { target: { value: "changed but cancelled" } });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onEditCard).not.toHaveBeenCalled();
  });

  // BRDG-490 #5: DRAFT cards are editable in place - title, bullets, and body.
  it("renames a DRAFT card title in place", () => {
    const onEditCard = vi.fn();
    render(<ChildStoryCard card={card({ cardIndex: 2, title: "Old title" })} onEditCard={onEditCard} />);

    fireEvent.click(screen.getByRole("button", { name: "Old title" }));
    const input = screen.getByDisplayValue("Old title");
    fireEvent.change(input, { target: { value: "New title" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onEditCard).toHaveBeenCalledWith(2, { title: "New title" });
  });

  it("does not persist an emptied title", () => {
    const onEditCard = vi.fn();
    render(<ChildStoryCard card={card({ title: "Keep me" })} onEditCard={onEditCard} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep me" }));
    const input = screen.getByDisplayValue("Keep me");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(onEditCard).not.toHaveBeenCalled();
  });

  it("edits a DRAFT card's bullets in place (one per line)", () => {
    const onEditCard = vi.fn();
    render(
      <ChildStoryCard card={card({ cardIndex: 3, bullets: ["one", "two"] })} onEditCard={onEditCard} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit bullets/i }));
    const textarea = screen.getByPlaceholderText("One bullet per line");
    fireEvent.change(textarea, { target: { value: "one\nthree\n" } });
    fireEvent.blur(textarea);

    expect(onEditCard).toHaveBeenCalledWith(3, { bullets: ["one", "three"] });
  });

  it("offers Add detail on a DRAFT card with no body yet", () => {
    render(<ChildStoryCard card={card({ bullets: ["b"], body: null })} onEditCard={vi.fn()} />);
    expect(screen.getByRole("button", { name: /add detail/i })).toBeInTheDocument();
  });

  // Created cards round-trip through the story editor, so no inline editing here.
  it("does not offer inline title/bullets/detail editing on a created card", () => {
    render(
      <ChildStoryCard
        card={card({ status: "created", jiraKey: "VPL-900", title: "Live", bullets: ["b"], body: "Body" })}
        onEditCard={vi.fn()}
      />,
    );
    // Title is plain text, not a rename button.
    expect(screen.queryByRole("button", { name: "Live" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit bullets/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show detail/i }));
    expect(screen.queryByRole("button", { name: /edit detail/i })).not.toBeInTheDocument();
  });

  it("shows a Create in Jira menu on a DRAFT card and promotes with the chosen placement", async () => {
    const onCreateInJira = vi.fn().mockResolvedValue(undefined);
    render(<ChildStoryCard card={card({ cardIndex: 3 })} onCreateInJira={onCreateInJira} />);

    fireEvent.click(screen.getByRole("button", { name: /create in jira/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /to be planned/i }));

    await waitFor(() => expect(onCreateInJira).toHaveBeenCalledWith(3, "__backlog__"));
  });

  it("shows the Jira key and hides the Create menu once the card is created", () => {
    render(
      <ChildStoryCard
        card={card({ status: "created", jiraKey: "VPL-201" })}
        onCreateInJira={vi.fn()}
      />,
    );
    expect(screen.getByText("VPL-201")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create in jira/i })).not.toBeInTheDocument();
  });

  it("lists a suggested link and confirms it only when both ends are created", async () => {
    const onConfirmLink = vi.fn().mockResolvedValue(undefined);
    render(
      <ChildStoryCard
        card={card({
          cardIndex: 0,
          status: "created",
          jiraKey: "VPL-301",
          suggestedLinks: [{ targetIndex: 1, relation: "blocks", confirmed: false }],
        })}
        onConfirmLink={onConfirmLink}
        cardTitles={{ 0: "A", 1: "B" }}
        createdIndexes={new Set([0, 1])}
      />,
    );

    expect(screen.getByText("blocks")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(onConfirmLink).toHaveBeenCalledWith(0, 1, "blocks"));
  });

  it("disables link confirmation when the target is still a DRAFT", () => {
    render(
      <ChildStoryCard
        card={card({
          cardIndex: 0,
          status: "created",
          jiraKey: "VPL-301",
          suggestedLinks: [{ targetIndex: 1, relation: "blocks", confirmed: false }],
        })}
        onConfirmLink={vi.fn()}
        cardTitles={{ 0: "A", 1: "B" }}
        createdIndexes={new Set([0])}
      />,
    );
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("shows the current sprint on a created card", () => {
    render(
      <ChildStoryCard
        card={card({ status: "created", jiraKey: "VPL-201", liveSprintId: "42", liveSprintName: "Sprint 42" })}
      />,
    );
    expect(screen.getByText("Sprint 42")).toBeInTheDocument();
  });

  // BRDG-487 #9: created cards now use Bridge's standard sprint representation
  // (SprintOrBacklogBadge): the sprint name when scheduled, a "Backlog" chip when not.
  it("shows a 'Backlog' chip for a created card with no sprint", () => {
    render(
      <ChildStoryCard card={card({ status: "created", jiraKey: "VPL-201", liveSprintId: null })} />,
    );
    expect(screen.getByText("Backlog")).toBeInTheDocument();
    expect(screen.queryByText(/to be planned/i)).not.toBeInTheDocument();
  });

  it("badges the scheduled sprint of a created card with its name (BRDG-486/487)", () => {
    render(
      <ChildStoryCard
        card={card({ status: "created", jiraKey: "VPL-201", liveSprintId: "42", liveSprintName: "Sprint 42" })}
      />,
    );
    expect(screen.getByText("Sprint 42")).toBeInTheDocument();
  });

  it("marks a DRAFT card as not schedulable until it is created in Jira (BRDG-486)", () => {
    // The default card has bullets, so the merged badge reads "Draft · Bullets".
    render(<ChildStoryCard card={card({})} />);
    expect(screen.getByText("Draft · Bullets")).toHaveAttribute(
      "title",
      expect.stringMatching(/create this story in jira/i),
    );
  });

  it("offers a Move sprint menu on a created card and reassigns to the chosen sprint", async () => {
    const onReassignSprint = vi.fn().mockResolvedValue(undefined);
    render(
      <ChildStoryCard
        card={card({ status: "created", jiraKey: "VPL-201", liveSprintId: null })}
        onReassignSprint={onReassignSprint}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /move sprint/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /sprint 42/i }));

    await waitFor(() => expect(onReassignSprint).toHaveBeenCalledWith("VPL-201", "42"));
  });

  it("can reassign a created card to the backlog", async () => {
    const onReassignSprint = vi.fn().mockResolvedValue(undefined);
    render(
      <ChildStoryCard
        card={card({ status: "created", jiraKey: "VPL-201", liveSprintId: "42", liveSprintName: "Sprint 42" })}
        onReassignSprint={onReassignSprint}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /move sprint/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /to be planned/i }));

    await waitFor(() => expect(onReassignSprint).toHaveBeenCalledWith("VPL-201", "__backlog__"));
  });

  it("does not offer a Move sprint menu on a DRAFT card", () => {
    render(<ChildStoryCard card={card({})} onReassignSprint={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /move sprint/i })).not.toBeInTheDocument();
  });

  it("does not offer the default-sprint option when reassigning", async () => {
    render(
      <ChildStoryCard
        card={card({ status: "created", jiraKey: "VPL-201", liveSprintId: null })}
        onReassignSprint={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /move sprint/i }));
    await screen.findByRole("menuitem", { name: /to be planned/i });
    expect(screen.queryByRole("menuitem", { name: /default sprint/i })).not.toBeInTheDocument();
  });

  it("shows an already-confirmed link as Linked with no confirm button", () => {
    render(
      <ChildStoryCard
        card={card({
          cardIndex: 0,
          status: "created",
          jiraKey: "VPL-301",
          suggestedLinks: [{ targetIndex: 1, relation: "blocks", confirmed: true }],
        })}
        onConfirmLink={vi.fn()}
        cardTitles={{ 0: "A", 1: "B" }}
        createdIndexes={new Set([0, 1])}
      />,
    );
    expect(screen.getByText(/linked/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();
  });

  // BRDG-490 #1: a collapsed card folds to its title + actions, hiding the
  // bullets, worked-out body, and suggested links (supersedes BRDG-487 #2 compact).
  it("hides bullets, detail, and links when collapsed but keeps the title", () => {
    render(
      <ChildStoryCard
        card={card({
          title: "Collapsed card",
          bullets: ["a hidden bullet"],
          body: "hidden worked-out body",
          suggestedLinks: [{ targetIndex: 1, relation: "blocks", confirmed: false }],
        })}
        cardTitles={{ 0: "A", 1: "B" }}
        collapsed
      />,
    );
    expect(screen.getByText("Collapsed card")).toBeInTheDocument();
    expect(screen.queryByText("a hidden bullet")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show detail/i })).not.toBeInTheDocument();
    expect(screen.queryByText("blocks")).not.toBeInTheDocument();
  });

  // BRDG-490 #1: each card carries its own collapse chevron when the board
  // provides a toggle.
  it("renders a per-card collapse chevron and calls onToggleCollapse", () => {
    const onToggleCollapse = vi.fn();
    render(
      <ChildStoryCard card={card({ bullets: ["b"] })} onToggleCollapse={onToggleCollapse} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /collapse card/i }));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it("shows an expand affordance when a collapsed card has a toggle", () => {
    render(
      <ChildStoryCard card={card({ bullets: ["b"] })} collapsed onToggleCollapse={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /expand card/i })).toBeInTheDocument();
  });

  it("omits the collapse chevron on a read-only card (no toggle handler)", () => {
    render(<ChildStoryCard card={card({ bullets: ["b"] })} />);
    expect(screen.queryByRole("button", { name: /collapse card|expand card/i })).not.toBeInTheDocument();
  });

  it("shows bullets and links by default (expanded)", () => {
    render(
      <ChildStoryCard
        card={card({ bullets: ["a visible bullet"] })}
      />,
    );
    expect(screen.getByText("a visible bullet")).toBeInTheDocument();
  });

  // BRDG-487 #10: the board injects a drag handle rendered in the card header.
  it("renders the drag handle when provided", () => {
    render(
      <ChildStoryCard
        card={card({})}
        dragHandle={<button aria-label="Drag to reorder">grip</button>}
      />,
    );
    expect(screen.getByRole("button", { name: /drag to reorder/i })).toBeInTheDocument();
  });
});
