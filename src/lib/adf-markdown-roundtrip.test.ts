// @vitest-environment node
// Shared bidirectional round-trip test for BRDG-267 (read) + BRDG-268 (write).
// The guarantee is content stability (no text is lost), not byte-for-byte
// fidelity: marks such as underline are intentionally dropped, and structure
// like layout columns is flattened.
import { describe, it, expect } from "vitest";
import { adfToMarkdown } from "./adf-to-markdown";
import { markdownToAdf } from "./markdown-to-adf";

interface Node {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
}

// Concatenates every textual atom in an ADF tree, ignoring marks and structure.
function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Node;
  let out = "";
  if (n.type === "text" && typeof n.text === "string") out += n.text;
  if (n.type === "status") out += String(n.attrs?.text ?? "");
  if (n.type === "date") out += String(n.attrs?.timestamp ?? "");
  if (n.type === "emoji") out += String(n.attrs?.shortName ?? "");
  if (Array.isArray(n.content)) out += " " + n.content.map(extractText).join(" ");
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

// A representative document touching every node type fixed or relied on by the
// two stories.
const REPRESENTATIVE_ADF = {
  type: "doc",
  version: 1,
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Acceptance criteria" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Ship by " },
        { type: "date", attrs: { timestamp: "1718409600000" } },
        { type: "text", text: " with status " },
        { type: "status", attrs: { text: "In Progress", color: "blue" } },
        { type: "text", text: " and " },
        { type: "text", text: "underlined", marks: [{ type: "underline" }] },
        { type: "text", text: " note." },
      ],
    },
    { type: "bulletList", content: [
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "first bullet" }] }] },
    ] },
    {
      type: "taskList",
      attrs: { localId: "tl1" },
      content: [
        { type: "taskItem", attrs: { localId: "t1", state: "TODO" }, content: [{ type: "text", text: "open task" }] },
        { type: "taskItem", attrs: { localId: "t2", state: "DONE" }, content: [{ type: "text", text: "closed task" }] },
      ],
    },
    {
      type: "panel",
      attrs: { panelType: "info" },
      content: [{ type: "paragraph", content: [{ type: "text", text: "panel body" }] }],
    },
    {
      type: "decisionList",
      attrs: { localId: "dl1" },
      content: [
        { type: "decisionItem", attrs: { localId: "di1", state: "DECIDED" }, content: [{ type: "text", text: "use SQLite" }] },
      ],
    },
  ],
};

describe("ADF <-> Markdown round-trip (BRDG-267 + BRDG-268)", () => {
  it("adf -> md -> adf preserves all text content", () => {
    const md = adfToMarkdown(REPRESENTATIVE_ADF);
    const back = markdownToAdf(md);
    expect(norm(extractText(back))).toBe(norm(extractText(REPRESENTATIVE_ADF)));
  });

  it("preserves the task list (states and text) through the round-trip", () => {
    const md = adfToMarkdown(REPRESENTATIVE_ADF);
    const back = markdownToAdf(md);
    const taskList = back.content!.find((n) => n.type === "taskList");
    expect(taskList).toBeDefined();
    const states = taskList!.content!.map((t) => t.attrs!.state);
    expect(states).toEqual(["TODO", "DONE"]);
    const texts = taskList!.content!.map((t) => t.content![0].text);
    expect(texts).toEqual(["open task", "closed task"]);
  });

  it("preserves date and status nodes through the round-trip", () => {
    const back = markdownToAdf(adfToMarkdown(REPRESENTATIVE_ADF));
    const flat: Node[] = [];
    const walk = (n: Node) => { flat.push(n); n.content?.forEach(walk); };
    back.content!.forEach(walk);
    const date = flat.find((n) => n.type === "date");
    const status = flat.find((n) => n.type === "status");
    expect(date!.attrs!.timestamp).toBe("1718409600000");
    expect(status!.attrs).toEqual({ text: "In Progress", color: "blue" });
  });

  it("markdown is stable on a second pass (md -> adf -> md idempotent)", () => {
    const md1 = adfToMarkdown(REPRESENTATIVE_ADF);
    const md2 = adfToMarkdown(markdownToAdf(md1));
    expect(md2.trim()).toBe(md1.trim());
  });
});
