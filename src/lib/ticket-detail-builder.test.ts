import { describe, it, expect } from "vitest";
import { buildAssignee, attachmentColor, resolveAttachmentRefs } from "./ticket-detail-builder";

describe("buildAssignee", () => {
  it("returns null for null name", () => {
    expect(buildAssignee(null)).toBeNull();
  });

  it("builds assignee with initials and color", () => {
    const result = buildAssignee("John Doe");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("John Doe");
    expect(result!.initials).toBe("JD");
    expect(result!.color).toBeTruthy();
  });

  it("handles single-word name", () => {
    const result = buildAssignee("Admin");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Admin");
  });
});

describe("attachmentColor", () => {
  it("returns blue for images", () => {
    expect(attachmentColor("image/png")).toBe("#4a90d9");
    expect(attachmentColor("image/jpeg")).toBe("#4a90d9");
  });

  it("returns red for PDFs", () => {
    expect(attachmentColor("application/pdf")).toBe("#e5534b");
  });

  it("returns green for spreadsheets", () => {
    expect(attachmentColor("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("#4aaa60");
  });

  it("returns gray for unknown types", () => {
    expect(attachmentColor("application/octet-stream")).toBe("#94a3b8");
  });
});

describe("resolveAttachmentRefs", () => {
  const filenameToId = new Map([
    ["screenshot.png", "att-1"],
    ["diagram.jpg", "att-2"],
  ]);

  it("resolves markdown attachment refs", () => {
    const input = "See ![screenshot.png](attachment)";
    const result = resolveAttachmentRefs(input, filenameToId);
    expect(result).toBe("See ![screenshot.png](/api/attachments/att-1)");
  });

  it("resolves Jira wiki markup refs", () => {
    const input = "!diagram.jpg!";
    const result = resolveAttachmentRefs(input, filenameToId);
    expect(result).toBe("![diagram.jpg](/api/attachments/att-2)");
  });

  it("resolves Jira wiki markup with thumbnail option", () => {
    const input = "!screenshot.png|thumbnail!";
    const result = resolveAttachmentRefs(input, filenameToId);
    expect(result).toBe("![screenshot.png](/api/attachments/att-1)");
  });

  it("leaves unresolvable refs as attachment placeholder", () => {
    const input = "![unknown.png](attachment)";
    const result = resolveAttachmentRefs(input, filenameToId);
    expect(result).toBe("![unknown.png](attachment)");
  });

  it("handles text with no attachment refs", () => {
    const input = "Just regular text with no images";
    const result = resolveAttachmentRefs(input, filenameToId);
    expect(result).toBe(input);
  });
});
