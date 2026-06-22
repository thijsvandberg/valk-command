import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TicketGroup } from "./TicketGroup";
import type { StakeholderTicket } from "@/lib/stakeholder-data";

vi.mock("@/lib/jira-url", () => ({
  getJiraUrl: (key: string) => `https://jira.example.com/browse/${key}`,
}));

function makeTicket(title: string, overrides: Partial<StakeholderTicket> = {}): StakeholderTicket {
  return {
    title,
    epic: "Core Platform",
    type: "story",
    status: "In Progress",
    storyPoints: null,
    businessValue: null,
    assignee: null,
    jiraKey: null,
    ...overrides,
  };
}

describe("TicketGroup", () => {
  it("renders an empty state message when no tickets are provided", () => {
    render(<TicketGroup tickets={[]} />);
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("renders ticket titles", () => {
    render(
      <TicketGroup
        tickets={[
          makeTicket("Build login page"),
          makeTicket("Add unit tests"),
        ]}
      />,
    );
    expect(screen.getByText("Build login page")).toBeInTheDocument();
    expect(screen.getByText("Add unit tests")).toBeInTheDocument();
  });

  it("groups tickets by epic with the epic name as a header", () => {
    render(
      <TicketGroup
        tickets={[
          makeTicket("Feature A", { epic: "Auth" }),
          makeTicket("Feature B", { epic: "Payments" }),
        ]}
      />,
    );
    expect(screen.getByText("Auth")).toBeInTheDocument();
    expect(screen.getByText("Payments")).toBeInTheDocument();
  });

  it("groups tickets with null epic under 'Other'", () => {
    render(
      <TicketGroup
        tickets={[makeTicket("Orphan ticket", { epic: null })]}
      />,
    );
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  it("renders multiple tickets in the same epic group", () => {
    render(
      <TicketGroup
        tickets={[
          makeTicket("Story 1", { epic: "Auth" }),
          makeTicket("Story 2", { epic: "Auth" }),
        ]}
      />,
    );
    // Only one "Auth" heading
    expect(screen.getAllByText("Auth")).toHaveLength(1);
    expect(screen.getByText("Story 1")).toBeInTheDocument();
    expect(screen.getByText("Story 2")).toBeInTheDocument();
  });

  it("renders BV badge when businessValue is set", () => {
    render(
      <TicketGroup
        tickets={[makeTicket("High value story", { businessValue: 5 })]}
      />,
    );
    expect(screen.getByLabelText("Business Value: 5")).toBeInTheDocument();
  });

  it("renders '-' BV badge when businessValue is 0", () => {
    render(
      <TicketGroup
        tickets={[makeTicket("Zero value story", { businessValue: 0 })]}
      />,
    );
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("renders ticket without BV value badge when businessValue is null", () => {
    render(
      <TicketGroup
        tickets={[makeTicket("No BV ticket", { businessValue: null })]}
      />,
    );
    expect(screen.getByText("No BV ticket")).toBeInTheDocument();
  });

  it("renders story points when storyPoints is set", () => {
    render(
      <TicketGroup
        tickets={[makeTicket("Estimated story", { storyPoints: 8 })]}
      />,
    );
    expect(screen.getByLabelText("Story Points: 8")).toBeInTheDocument();
  });

  it("renders bug type badge", () => {
    render(
      <TicketGroup
        tickets={[makeTicket("Critical bug", { type: "bug" })]}
      />,
    );
    expect(screen.getByText("bug")).toBeInTheDocument();
  });

  it("renders spike type badge", () => {
    render(
      <TicketGroup
        tickets={[makeTicket("Auth spike", { type: "spike" })]}
      />,
    );
    expect(screen.getByText("spike")).toBeInTheDocument();
  });

  it("does not render type badge for story type", () => {
    const { container } = render(
      <TicketGroup
        tickets={[makeTicket("Regular story", { type: "story" })]}
      />,
    );
    expect(container.querySelector(".bg-red-500\\/15")).not.toBeInTheDocument();
    expect(container.querySelector(".bg-violet-500\\/15")).not.toBeInTheDocument();
  });

  it("renders Jira link when jiraKey is set", () => {
    render(
      <TicketGroup
        tickets={[makeTicket("Linked ticket", { jiraKey: "VPL-42" })]}
      />,
    );
    const link = screen.getByLabelText("Open VPL-42 in Jira");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://jira.example.com/browse/VPL-42");
  });

  it("does not render Jira link when jiraKey is null", () => {
    render(
      <TicketGroup
        tickets={[makeTicket("Unlinked ticket", { jiraKey: null })]}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders ticket key when showKeys is true and jiraKey is set", () => {
    render(
      <TicketGroup
        tickets={[makeTicket("Keyed ticket", { jiraKey: "VPL-10" })]}
        showKeys={true}
      />,
    );
    expect(screen.getByText("VPL-10")).toBeInTheDocument();
  });

  it("does not render ticket key by default", () => {
    render(
      <TicketGroup
        tickets={[makeTicket("No key ticket", { jiraKey: "VPL-99" })]}
        showKeys={false}
      />,
    );
    // The key "VPL-99" should not appear as a standalone visible text element
    // (it is only in the aria-label of the Jira link)
    expect(screen.queryByText("VPL-99")).not.toBeInTheDocument();
  });

  it("renders assignee avatar when showAssignee is true", () => {
    render(
      <TicketGroup
        tickets={[
          makeTicket("Assigned ticket", {
            assignee: { name: "Alice Smith", initials: "AS" },
          }),
        ]}
        showAssignee={true}
      />,
    );
    expect(screen.getByTitle("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("AS")).toBeInTheDocument();
  });

  it("does not render assignee by default", () => {
    render(
      <TicketGroup
        tickets={[
          makeTicket("Unshown assignee", {
            assignee: { name: "Bob Jones", initials: "BJ" },
          }),
        ]}
      />,
    );
    expect(screen.queryByTitle("Bob Jones")).not.toBeInTheDocument();
  });

  it("renders 'carried' badge for tickets in carriedKeys", () => {
    render(
      <TicketGroup
        tickets={[makeTicket("Carried ticket", { jiraKey: "VPL-5" })]}
        carriedKeys={new Set(["VPL-5"])}
      />,
    );
    expect(screen.getByText("carried")).toBeInTheDocument();
  });

  it("does not render 'carried' badge for tickets not in carriedKeys", () => {
    render(
      <TicketGroup
        tickets={[makeTicket("Fresh ticket", { jiraKey: "VPL-6" })]}
        carriedKeys={new Set(["VPL-5"])}
      />,
    );
    expect(screen.queryByText("carried")).not.toBeInTheDocument();
  });

  // Regression: rows used index keys, so reordering reassigned per-row state to the
  // wrong ticket. Keying by jiraKey preserves each row's DOM identity across reorder.
  it("preserves per-row DOM identity when the list is reordered", () => {
    const alpha = makeTicket("Alpha", { jiraKey: "VPL-1", epic: "E" });
    const beta = makeTicket("Beta", { jiraKey: "VPL-2", epic: "E" });

    const { rerender } = render(<TicketGroup tickets={[alpha, beta]} />);

    const alphaRow = screen.getByText("Alpha").closest("li") as HTMLLIElement;
    alphaRow.dataset.marker = "alpha";

    // Swap order: with index keys Alpha's text would land on an unmarked node;
    // with jiraKey keys the marked node travels with Alpha.
    rerender(<TicketGroup tickets={[beta, alpha]} />);

    const alphaRowAfter = screen.getByText("Alpha").closest("li") as HTMLLIElement;
    expect(alphaRowAfter.dataset.marker).toBe("alpha");
  });
});
