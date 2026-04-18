import { describe, it, expect } from "vitest";
import { formatTicketShare, formatTicketsShare } from "./ticket-share";

describe("formatTicketShare", () => {
  it("formats single ticket as Title - URL", () => {
    const result = formatTicketShare("Sprint board verbetering", "VPL-43566");
    expect(result).toBe("Sprint board verbetering - https://new-story.atlassian.net/browse/VPL-43566");
  });
});

describe("formatTicketsShare", () => {
  it("formats multiple tickets as list with - prefix", () => {
    const result = formatTicketsShare([
      { title: "Ticket A", key: "VPL-1" },
      { title: "Ticket B", key: "VPL-2" },
    ]);
    expect(result).toBe(
      "- Ticket A - https://new-story.atlassian.net/browse/VPL-1\n- Ticket B - https://new-story.atlassian.net/browse/VPL-2",
    );
  });

  it("returns single-line string (no trailing newline) for one ticket", () => {
    const result = formatTicketsShare([{ title: "Solo", key: "VPL-99" }]);
    expect(result).toBe("- Solo - https://new-story.atlassian.net/browse/VPL-99");
  });
});
