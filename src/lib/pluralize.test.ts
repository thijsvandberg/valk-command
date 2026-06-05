import { describe, it, expect } from "vitest";
import { pluralize } from "./pluralize";

describe("pluralize", () => {
  it("returns the singular noun for a count of 1", () => {
    expect(pluralize(1, "item")).toBe("item");
  });

  it("returns the plural noun for a count of 0", () => {
    expect(pluralize(0, "item")).toBe("items");
  });

  it("returns the plural noun for counts above 1", () => {
    expect(pluralize(2, "item")).toBe("items");
    expect(pluralize(8, "item")).toBe("items");
  });

  it("uses an explicit plural form when the noun is irregular", () => {
    expect(pluralize(1, "story", "stories")).toBe("story");
    expect(pluralize(3, "story", "stories")).toBe("stories");
  });
});
