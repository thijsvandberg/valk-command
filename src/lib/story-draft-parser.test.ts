import { describe, it, expect } from "vitest";
import { extractStoryDraft } from "./story-draft-parser";

describe("extractStoryDraft", () => {
  it("extracts draft from story-draft tags", () => {
    const output = `Here's my improved version:

<story-draft>
### User Story

As a guest,<br>I want to see my upgrade cost,<br>So that I know what I'm paying extra.

### Acceptance Criteria

- Upgrade line item shows original room + surcharge
- Prices add up correctly
</story-draft>

Let me know if you'd like any changes.`;

    const result = extractStoryDraft(output);
    expect(result).toBe(`### User Story

As a guest,<br>I want to see my upgrade cost,<br>So that I know what I'm paying extra.

### Acceptance Criteria

- Upgrade line item shows original room + surcharge
- Prices add up correctly`);
  });

  it("returns null when no story-draft tags present", () => {
    const output = "Sure, I can help with that. What would you like to change?";
    expect(extractStoryDraft(output)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(extractStoryDraft("")).toBeNull();
  });

  it("extracts first draft when multiple are present", () => {
    const output = `<story-draft>First draft</story-draft>

Actually, here's a better version:

<story-draft>Second draft</story-draft>`;

    expect(extractStoryDraft(output)).toBe("First draft");
  });

  it("trims whitespace from extracted draft", () => {
    const output = `<story-draft>

  Some content with leading/trailing whitespace

</story-draft>`;

    expect(extractStoryDraft(output)).toBe("Some content with leading/trailing whitespace");
  });

  it("handles draft with special characters", () => {
    const output = `<story-draft>
### Problem

The \`hotel.code\` field contains **old** codes (e.g. "AMS-01") instead of new ones.

- Item 1 & Item 2
- Price: >= 100
</story-draft>`;

    const result = extractStoryDraft(output);
    expect(result).toContain("`hotel.code`");
    expect(result).toContain("**old**");
    expect(result).toContain("&");
    expect(result).toContain(">=");
  });
});
