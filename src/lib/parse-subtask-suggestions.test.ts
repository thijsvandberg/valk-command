import { describe, it, expect } from "vitest";
import { parseSubtaskSuggestions } from "./parse-subtask-suggestions";

describe("parseSubtaskSuggestions", () => {
  it("parses numbered list", () => {
    const output = `Here are subtask suggestions:

1. Set up database schema
2. Create API endpoints
3. Build frontend form`;

    expect(parseSubtaskSuggestions(output)).toEqual([
      "Set up database schema",
      "Create API endpoints",
      "Build frontend form",
    ]);
  });

  it("parses bulleted list with dashes", () => {
    const output = `- Write unit tests
- Add integration tests
- Update documentation`;

    expect(parseSubtaskSuggestions(output)).toEqual([
      "Write unit tests",
      "Add integration tests",
      "Update documentation",
    ]);
  });

  it("parses bulleted list with asterisks", () => {
    const output = `* Design mockups
* Implement UI components
* Add accessibility labels`;

    expect(parseSubtaskSuggestions(output)).toEqual([
      "Design mockups",
      "Implement UI components",
      "Add accessibility labels",
    ]);
  });

  it("parses numbered list with closing parenthesis", () => {
    const output = `1) First task
2) Second task
3) Third task`;

    expect(parseSubtaskSuggestions(output)).toEqual([
      "First task",
      "Second task",
      "Third task",
    ]);
  });

  it("strips markdown bold formatting", () => {
    const output = `1. **Set up database schema**
2. __Create API endpoints__`;

    expect(parseSubtaskSuggestions(output)).toEqual([
      "Set up database schema",
      "Create API endpoints",
    ]);
  });

  it("strips inline code backticks", () => {
    const output = `1. Create \`UserService\` class
2. Add \`GET /api/users\` endpoint`;

    expect(parseSubtaskSuggestions(output)).toEqual([
      "Create UserService class",
      "Add GET /api/users endpoint",
    ]);
  });

  it("strips trailing punctuation", () => {
    const output = `1. Set up database schema.
2. Create API endpoints;
3. Build frontend form:`;

    expect(parseSubtaskSuggestions(output)).toEqual([
      "Set up database schema",
      "Create API endpoints",
      "Build frontend form",
    ]);
  });

  it("ignores non-list lines (prose, headers)", () => {
    const output = `## Suggested Subtasks

Based on the ticket description, here are the subtasks:

1. Implement login form
2. Add validation logic

These should cover the main work items.`;

    expect(parseSubtaskSuggestions(output)).toEqual([
      "Implement login form",
      "Add validation logic",
    ]);
  });

  it("handles mixed list formats", () => {
    const output = `1. First numbered item
- A dash item
* An asterisk item
2. Second numbered item`;

    expect(parseSubtaskSuggestions(output)).toEqual([
      "First numbered item",
      "A dash item",
      "An asterisk item",
      "Second numbered item",
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(parseSubtaskSuggestions("")).toEqual([]);
    expect(parseSubtaskSuggestions("   ")).toEqual([]);
  });

  it("returns empty array for prose-only input", () => {
    const output = `This ticket looks well-defined and doesn't need subtasks.
The work is straightforward enough to handle as a single unit.`;

    expect(parseSubtaskSuggestions(output)).toEqual([]);
  });

  it("filters out overly long titles (>255 chars)", () => {
    const longTitle = "A".repeat(256);
    const output = `1. ${longTitle}
2. Normal title`;

    expect(parseSubtaskSuggestions(output)).toEqual(["Normal title"]);
  });

  it("handles plus-sign bullets", () => {
    const output = `+ First item
+ Second item`;

    expect(parseSubtaskSuggestions(output)).toEqual([
      "First item",
      "Second item",
    ]);
  });
});
