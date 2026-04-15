import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InvestigationResult } from "./InvestigationResult";
import type { InvestigationData } from "@/lib/investigation-parser";

// Mock next/link to render a plain <a>
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock useTicketExists to avoid actual fetches
vi.mock("@/hooks/useTicketExists", () => ({
  useTicketExists: (key: string | null) => {
    if (key === "VPL-12345") {
      return { exists: true, status: "IN PROGRESS", loading: false };
    }
    return { exists: false, status: null, loading: false };
  },
}));

const BASIC_DATA: InvestigationData = {
  question: "When do we show the cancellation button?",
  finding: "The button is shown when the booking is confirmed and departure is more than 48h away.",
  howItWorks: "1. Check booking status\n2. Check departure date",
  whatsMissing: null,
  whatWouldBeNeeded: null,
  relatedStories: [],
  keyFiles: [
    { file: "apps/web/src/pages/BookingDetail.tsx", purpose: "Renders the cancellation button" },
  ],
  stakeholderSummary: null,
  isLong: false,
};

const FULL_DATA: InvestigationData = {
  question: "How does the upgrade service work?",
  finding: "The upgrade service queries the inventory API for available rooms.",
  howItWorks: "1. Get current booking\n2. Query inventory\n3. Filter by loyalty tier",
  whatsMissing: "No handling for split-stay bookings.",
  whatWouldBeNeeded: "A date-range splitter for inventory queries.",
  relatedStories: [
    { key: "VPL-12345", summary: "Room upgrade flow", relevance: "Built the original feature" },
    { key: "VPL-99999", summary: "Inventory API v2", relevance: "Changed the endpoint" },
  ],
  keyFiles: [
    { file: "apps/api/src/services/upgrade.go", purpose: "Main upgrade logic" },
    { file: "valk-nx/libs/inventory/client.ts", purpose: "Inventory client" },
  ],
  stakeholderSummary: "**Room Upgrade Availability**\n\nThe system finds upgrade options by checking room availability for the same dates.",
  isLong: true,
};

const RAW_CONTENT = "## Question\nTest\n\n## Finding\nTest finding";

describe("InvestigationResult", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the question header", () => {
    render(<InvestigationResult data={BASIC_DATA} rawContent={RAW_CONTENT} />);
    expect(screen.getByText("When do we show the cancellation button?")).toBeDefined();
  });

  it("renders the finding card", () => {
    render(<InvestigationResult data={BASIC_DATA} rawContent={RAW_CONTENT} />);
    expect(screen.getByText(/button is shown when the booking is confirmed/)).toBeDefined();
  });

  it("renders How it works section with content visible when not long", () => {
    render(<InvestigationResult data={BASIC_DATA} rawContent={RAW_CONTENT} />);
    expect(screen.getByText("How it works")).toBeDefined();
    // Content should be visible (defaultOpen=true when !isLong)
    expect(screen.getByText(/Check booking status/)).toBeDefined();
  });

  it("renders key files with filename highlighted", () => {
    render(<InvestigationResult data={BASIC_DATA} rawContent={RAW_CONTENT} />);
    expect(screen.getByText("BookingDetail.tsx")).toBeDefined();
  });

  it("does not render stakeholder summary when not present", () => {
    render(<InvestigationResult data={BASIC_DATA} rawContent={RAW_CONTENT} />);
    expect(screen.queryByText("Summary for Stakeholders")).toBeNull();
  });

  it("renders stakeholder summary card when present", () => {
    render(<InvestigationResult data={FULL_DATA} rawContent={RAW_CONTENT} />);
    expect(screen.getByText("Summary for Stakeholders")).toBeDefined();
    expect(screen.getByText("Room Upgrade Availability")).toBeDefined();
  });

  it("renders What's missing section when present", () => {
    render(<InvestigationResult data={FULL_DATA} rawContent={RAW_CONTENT} />);
    expect(screen.getByText("What's missing")).toBeDefined();
  });

  it("renders related stories with local ticket linked to /tickets/", () => {
    render(<InvestigationResult data={FULL_DATA} rawContent={RAW_CONTENT} />);
    // Expand the "Related stories" section (collapsed when isLong)
    fireEvent.click(screen.getByText("Related stories"));
    const localLink = screen.getByText("VPL-12345");
    expect(localLink.closest("a")?.getAttribute("href")).toBe("/tickets/VPL-12345");
  });

  it("renders external story link to Jira when not in local DB", () => {
    render(<InvestigationResult data={FULL_DATA} rawContent={RAW_CONTENT} />);
    fireEvent.click(screen.getByText("Related stories"));
    const externalLink = screen.getByText("VPL-99999");
    expect(externalLink.closest("a")?.getAttribute("href")).toContain("browse/VPL-99999");
  });

  it("collapses How it works when isLong is true", async () => {
    render(<InvestigationResult data={FULL_DATA} rawContent={RAW_CONTENT} />);
    // When isLong, "How it works" starts collapsed
    const howItWorksButton = screen.getByText("How it works");
    expect(howItWorksButton).toBeDefined();
    // Content should not be visible when collapsed
    expect(screen.queryByText(/Get current booking/)).toBeNull();

    // Expand it
    fireEvent.click(howItWorksButton);
    expect(screen.getByText(/Get current booking/)).toBeDefined();
  });

  it("renders repo badge for files with repo prefix", () => {
    render(<InvestigationResult data={FULL_DATA} rawContent={RAW_CONTENT} />);
    // Expand the "Key files" section (collapsed when isLong)
    fireEvent.click(screen.getByText("Key files"));
    expect(screen.getByText("valk-nx")).toBeDefined();
  });

  it("renders copy actions for the full result", () => {
    render(<InvestigationResult data={BASIC_DATA} rawContent={RAW_CONTENT} />);
    // Full result copy actions
    expect(screen.getByText("Markdown")).toBeDefined();
    expect(screen.getByText("Rich text")).toBeDefined();
  });

  it("renders per-card copy actions on stakeholder summary", () => {
    render(<InvestigationResult data={FULL_DATA} rawContent={RAW_CONTENT} />);
    // There should be multiple copy buttons (one for full result, one for stakeholder card)
    const markdownButtons = screen.getAllByText("Markdown");
    expect(markdownButtons.length).toBeGreaterThanOrEqual(2);
  });
});
