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

  it("labels the action Refine once a body exists", () => {
    render(<ChildStoryCard card={card({ body: "Worked out" })} onDeepen={vi.fn()} />);
    expect(screen.getByRole("button", { name: /refine/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^deepen$/i })).not.toBeInTheDocument();
  });

  it("shows the Full depth badge once a body is filled", () => {
    render(<ChildStoryCard card={card({ body: "Full description" })} />);
    expect(screen.getByTitle("Depth: Full")).toBeInTheDocument();
  });

  it("disables the deepen action while a task is busy", () => {
    render(<ChildStoryCard card={card({})} onDeepen={vi.fn()} busy />);
    expect(screen.getByRole("button", { name: /deepen/i })).toBeDisabled();
  });

  it("expands the worked-out body and persists an edit on blur", async () => {
    const onEditBody = vi.fn();
    render(<ChildStoryCard card={card({ cardIndex: 1, body: "Original body" })} onEditBody={onEditBody} />);

    // Body is collapsed by default; expand it.
    fireEvent.click(screen.getByRole("button", { name: /show detail/i }));
    expect(screen.getByText("Original body")).toBeInTheDocument();

    // Click the body region to edit, change it, blur to commit.
    fireEvent.click(screen.getByText("Original body"));
    const textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Edited body" } });
    fireEvent.blur(textarea);

    await waitFor(() => expect(onEditBody).toHaveBeenCalledWith(1, "Edited body"));
  });

  it("does not call onEditBody when the body is unchanged", async () => {
    const onEditBody = vi.fn();
    render(<ChildStoryCard card={card({ body: "Same" })} onEditBody={onEditBody} />);
    fireEvent.click(screen.getByRole("button", { name: /show detail/i }));
    fireEvent.click(screen.getByText("Same"));
    const textarea = await screen.findByRole("textbox");
    fireEvent.blur(textarea);
    expect(onEditBody).not.toHaveBeenCalled();
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

  it("shows 'To be planned' for a created card with no sprint", () => {
    render(
      <ChildStoryCard card={card({ status: "created", jiraKey: "VPL-201", liveSprintId: null })} />,
    );
    expect(screen.getByText(/to be planned/i)).toBeInTheDocument();
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
});
