import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TicketStatusPill } from "./TicketStatusPill";
import { JIRA_STATUS_ABBREVIATIONS, READINESS_CONFIG } from "@/types/ticket";

describe("JIRA_STATUS_ABBREVIATIONS", () => {
  it("maps all JiraStatus values", () => {
    expect(JIRA_STATUS_ABBREVIATIONS["TO DO"]).toBe("TODO");
    expect(JIRA_STATUS_ABBREVIATIONS["IN PROGRESS"]).toBe("PROG");
    expect(JIRA_STATUS_ABBREVIATIONS["TEST"]).toBe("TEST");
    expect(JIRA_STATUS_ABBREVIATIONS["DONE"]).toBe("DONE");
    expect(JIRA_STATUS_ABBREVIATIONS["DEPRECATED"]).toBe("DEPR");
  });
});

describe("READINESS_CONFIG", () => {
  it("has all four readiness values with label, color, and bg", () => {
    const values = ["drafting", "waiting_for_feedback", "ready_to_refine", "on_hold"] as const;
    for (const v of values) {
      expect(READINESS_CONFIG[v].label).toBeTruthy();
      expect(READINESS_CONFIG[v].color).toBeTruthy();
      expect(READINESS_CONFIG[v].bg).toBeTruthy();
    }
  });
});

describe("TicketStatusPill", () => {
  it("renders ticket key", () => {
    render(<TicketStatusPill ticketKey="VPL-123" jiraStatus="TO DO" />);
    expect(screen.getByText("VPL-123")).toBeTruthy();
  });

  it("renders abbreviated Jira status", () => {
    render(<TicketStatusPill ticketKey="VPL-1" jiraStatus="IN PROGRESS" />);
    expect(screen.getByText("PROG")).toBeTruthy();
  });

  it("hides readiness segment when readiness is null and no callback", () => {
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" readiness={null} />,
    );
    // No readiness icon rendered
    expect(container.querySelector("[title='Drafting']")).toBeNull();
  });

  it("renders readiness dot with icon when readiness is set", () => {
    render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" readiness="drafting" />,
    );
    // Readiness segment button has tooltip title
    expect(screen.getByTitle("Drafting")).toBeTruthy();
  });

  it("shows readiness segment (null state dot) when callback is wired but readiness is null", () => {
    const onChange = vi.fn();
    render(
      <TicketStatusPill
        ticketKey="VPL-1"
        jiraStatus="TO DO"
        readiness={null}
        onReadinessChange={onChange}
      />,
    );
    // Null-state button shows "Ready for Development" tooltip
    expect(screen.getByTitle("Ready for Development")).toBeTruthy();
  });

  it("opens readiness dropdown on click when callback provided", () => {
    const onChange = vi.fn();
    render(
      <TicketStatusPill
        ticketKey="VPL-1"
        jiraStatus="TO DO"
        readiness="drafting"
        onReadinessChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTitle("Drafting"));
    // Dropdown shows all options
    expect(screen.getByText("Waiting for Feedback")).toBeTruthy();
    expect(screen.getByText("Ready to Refine")).toBeTruthy();
    expect(screen.getByText("On Hold")).toBeTruthy();
    expect(screen.getByText("Ready for Development")).toBeTruthy();
  });

  it("calls onReadinessChange when option selected", () => {
    const onChange = vi.fn();
    render(
      <TicketStatusPill
        ticketKey="VPL-1"
        jiraStatus="TO DO"
        readiness="drafting"
        onReadinessChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTitle("Drafting"));
    fireEvent.click(screen.getByText("On Hold"));
    expect(onChange).toHaveBeenCalledWith("on_hold");
  });

  it("calls onReadinessChange with null when 'Ready for Development' selected", () => {
    const onChange = vi.fn();
    render(
      <TicketStatusPill
        ticketKey="VPL-1"
        jiraStatus="TO DO"
        readiness="on_hold"
        onReadinessChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTitle("On Hold"));
    fireEvent.click(screen.getByText("Ready for Development"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("does not open dropdown when no onReadinessChange provided", () => {
    render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" readiness="drafting" />,
    );
    const btn = screen.getByTitle("Drafting");
    fireEvent.click(btn);
    // No dropdown options visible
    expect(screen.queryByText("On Hold")).toBeNull();
  });

  it("calls onJiraStatusChange when Jira status selected", () => {
    const onChange = vi.fn();
    render(
      <TicketStatusPill
        ticketKey="VPL-1"
        jiraStatus="TO DO"
        onJiraStatusChange={onChange}
      />,
    );
    // Jira status button is clickable
    fireEvent.click(screen.getByTitle("TO DO"));
    // Dropdown shows full status names
    expect(screen.getByText("IN PROGRESS")).toBeTruthy();
    fireEvent.click(screen.getByText("IN PROGRESS"));
    expect(onChange).toHaveBeenCalledWith("IN PROGRESS");
  });
});
