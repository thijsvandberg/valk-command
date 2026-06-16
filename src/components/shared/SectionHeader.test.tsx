import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { SectionHeader } from "./SectionHeader";
import { __resetSectionCollapseStore } from "@/lib/section-collapse-store";

afterEach(() => {
  __resetSectionCollapseStore();
});

describe("SectionHeader (non-collapsible)", () => {
  it("renders title, count badge and actions without a toggle button", () => {
    render(
      <SectionHeader
        title="Attachments"
        count={3}
        actions={<button type="button">Filter</button>}
      />,
    );
    expect(screen.getByRole("heading", { name: "Attachments" })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
    // The heading itself is not a toggle when sectionKey is absent.
    expect(screen.queryByRole("button", { name: /Attachments/ })).not.toBeInTheDocument();
  });

  it("does not render a count badge when count is 0", () => {
    render(<SectionHeader title="Attachments" count={0} />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

describe("SectionHeader (collapsible)", () => {
  it("renders a toggle defaulting to expanded with its body visible", () => {
    render(
      <SectionHeader title="Jira Comments" count={2} sectionKey="jira-comments">
        <div>body content</div>
      </SectionHeader>,
    );
    const toggle = screen.getByRole("button", { name: /Jira Comments/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("body content")).toBeInTheDocument();
  });

  it("hides the body and actions when collapsed, keeps the count visible", () => {
    render(
      <SectionHeader
        title="Linked Issues"
        count={5}
        sectionKey="linked-issues"
        actions={<button type="button">Suggest</button>}
      >
        <div>body content</div>
      </SectionHeader>,
    );

    expect(screen.getByText("body content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suggest" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Linked Issues/ }));

    expect(screen.getByRole("button", { name: /Linked Issues/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("body content")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suggest" })).not.toBeInTheDocument();
    // Count badge stays visible while collapsed.
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("starts collapsed when defaultCollapsed is set, until toggled open", () => {
    render(
      <SectionHeader title="Linked Issues" sectionKey="linked-issues" defaultCollapsed>
        <div>body content</div>
      </SectionHeader>,
    );
    const toggle = screen.getByRole("button", { name: /Linked Issues/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("body content")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText("body content")).toBeInTheDocument();
  });

  it("re-expands on a second click", () => {
    render(
      <SectionHeader title="Confluence" sectionKey="confluence">
        <div>body content</div>
      </SectionHeader>,
    );
    const toggle = screen.getByRole("button", { name: /Confluence/ });
    fireEvent.click(toggle);
    expect(screen.queryByText("body content")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText("body content")).toBeInTheDocument();
  });

  it("shares collapse state across two headers with the same sectionKey", () => {
    render(
      <>
        <SectionHeader title="Jira Comments" sectionKey="jira-comments">
          <div>full-view body</div>
        </SectionHeader>
        <SectionHeader title="Comments" sectionKey="jira-comments">
          <div>session body</div>
        </SectionHeader>
      </>,
    );

    expect(screen.getByText("full-view body")).toBeInTheDocument();
    expect(screen.getByText("session body")).toBeInTheDocument();

    // Collapsing one heading collapses the other (shared global state).
    fireEvent.click(screen.getByRole("button", { name: /Jira Comments/ }));

    expect(screen.queryByText("full-view body")).not.toBeInTheDocument();
    expect(screen.queryByText("session body")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comments" })).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps different sectionKeys independent", () => {
    render(
      <>
        <SectionHeader title="Attachments" sectionKey="attachments">
          <div>attachments body</div>
        </SectionHeader>
        <SectionHeader title="Subtasks" sectionKey="subtasks">
          <div>subtasks body</div>
        </SectionHeader>
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Attachments/ }));

    expect(screen.queryByText("attachments body")).not.toBeInTheDocument();
    expect(screen.getByText("subtasks body")).toBeInTheDocument();
  });
});
