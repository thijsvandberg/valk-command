import { describe, it, expect } from "vitest";
import { markdownToAdf } from "./markdown-to-adf";

describe("markdownToAdf", () => {
  describe("inline marks", () => {
    it("bold", () => {
      const doc = markdownToAdf("**bold**");
      const text = doc.content![0].content![0];
      expect(text.text).toBe("bold");
      expect(text.marks).toEqual([{ type: "strong" }]);
    });

    it("italic", () => {
      const doc = markdownToAdf("*italic*");
      const text = doc.content![0].content![0];
      expect(text.text).toBe("italic");
      expect(text.marks).toEqual([{ type: "em" }]);
    });

    it("strikethrough", () => {
      const doc = markdownToAdf("~~strike~~");
      const text = doc.content![0].content![0];
      expect(text.text).toBe("strike");
      expect(text.marks).toEqual([{ type: "strike" }]);
    });

    it("bold+italic ***text***", () => {
      const doc = markdownToAdf("***bi***");
      const text = doc.content![0].content![0];
      expect(text.text).toBe("bi");
      expect(text.marks).toContainEqual({ type: "strong" });
      expect(text.marks).toContainEqual({ type: "em" });
    });

    it("bold+italic+strikethrough ***~~text~~***", () => {
      const doc = markdownToAdf("***~~bolditalicstrike~~***");
      const text = doc.content![0].content![0];
      expect(text.text).toBe("bolditalicstrike");
      expect(text.marks).toContainEqual({ type: "strong" });
      expect(text.marks).toContainEqual({ type: "em" });
      expect(text.marks).toContainEqual({ type: "strike" });
    });

    it("bold wrapping strikethrough **~~text~~**", () => {
      const doc = markdownToAdf("**~~boldstrike~~**");
      const text = doc.content![0].content![0];
      expect(text.text).toBe("boldstrike");
      expect(text.marks).toContainEqual({ type: "strong" });
      expect(text.marks).toContainEqual({ type: "strike" });
    });

    it("italic wrapping strikethrough *~~text~~*", () => {
      const doc = markdownToAdf("*~~italicstrike~~*");
      const text = doc.content![0].content![0];
      expect(text.text).toBe("italicstrike");
      expect(text.marks).toContainEqual({ type: "em" });
      expect(text.marks).toContainEqual({ type: "strike" });
    });
  });

  describe("flat bullet list", () => {
    it("produces a bulletList with listItems", () => {
      const doc = markdownToAdf("- one\n- two\n- three");
      const list = doc.content![0];
      expect(list.type).toBe("bulletList");
      expect(list.content).toHaveLength(3);
      expect(list.content![0].type).toBe("listItem");
      expect(list.content![0].content![0].content![0].text).toBe("one");
    });
  });

  describe("flat ordered list", () => {
    it("produces an orderedList with listItems", () => {
      const doc = markdownToAdf("1. first\n2. second");
      const list = doc.content![0];
      expect(list.type).toBe("orderedList");
      expect(list.content).toHaveLength(2);
      expect(list.content![0].content![0].content![0].text).toBe("first");
    });
  });

  describe("nested bullet list", () => {
    it("produces nested bulletList inside listItem", () => {
      const md = "- parent\n  - child";
      const doc = markdownToAdf(md);
      const outerList = doc.content![0];
      expect(outerList.type).toBe("bulletList");

      const parentItem = outerList.content![0];
      expect(parentItem.type).toBe("listItem");

      // First child of listItem is the paragraph with "parent"
      const para = parentItem.content![0];
      expect(para.type).toBe("paragraph");
      expect(para.content![0].text).toBe("parent");

      // Second child is the nested bulletList
      const nestedList = parentItem.content![1];
      expect(nestedList.type).toBe("bulletList");
      expect(nestedList.content![0].content![0].content![0].text).toBe("child");
    });

    it("handles three levels of nesting", () => {
      const md = "- a\n  - b\n    - c";
      const doc = markdownToAdf(md);
      const outer = doc.content![0];
      expect(outer.type).toBe("bulletList");
      const mid = outer.content![0].content![1];
      expect(mid.type).toBe("bulletList");
      const inner = mid.content![0].content![1];
      expect(inner.type).toBe("bulletList");
      expect(inner.content![0].content![0].content![0].text).toBe("c");
    });

    it("handles soft-enter continuation within a list item", () => {
      const md = "- first line\n  continuation";
      const doc = markdownToAdf(md);
      const list = doc.content![0];
      expect(list.type).toBe("bulletList");
      const item = list.content![0];
      const para = item.content![0];
      expect(para.type).toBe("paragraph");
      // Should have text, hardBreak, text
      expect(para.content![0].text).toBe("first line");
      expect(para.content![1].type).toBe("hardBreak");
      expect(para.content![2].text).toBe("continuation");
    });
  });

  describe("nested ordered list inside bullet list", () => {
    it("produces orderedList nested inside bulletList item", () => {
      const md = "- parent\n  1. first\n  2. second";
      const doc = markdownToAdf(md);
      const outer = doc.content![0];
      expect(outer.type).toBe("bulletList");
      const nestedOrdered = outer.content![0].content![1];
      expect(nestedOrdered.type).toBe("orderedList");
      expect(nestedOrdered.content).toHaveLength(2);
    });
  });

  describe("blank line between list items", () => {
    it("collects items across blank lines at the same level", () => {
      const md = "- one\n\n- two";
      const doc = markdownToAdf(md);
      const list = doc.content![0];
      expect(list.type).toBe("bulletList");
      expect(list.content).toHaveLength(2);
    });
  });
});
