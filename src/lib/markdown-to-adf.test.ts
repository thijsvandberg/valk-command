// @vitest-environment node
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

    // The ADF `code` mark is exclusive: Jira returns 400 INVALID_INPUT when it
    // is combined with formatting marks like strong/em/strike/textColor.
    it("inline code keeps only the code mark", () => {
      const doc = markdownToAdf("`code`");
      const text = doc.content![0].content![0];
      expect(text.text).toBe("code");
      expect(text.marks).toEqual([{ type: "code" }]);
    });

    it("bold wrapping inline code does not add strong to the code node", () => {
      const doc = markdownToAdf("**bold (`code`)**");
      const nodes = doc.content![0].content!;
      const codeNode = nodes.find((n) => n.text === "code")!;
      expect(codeNode.marks).toEqual([{ type: "code" }]);
      // Surrounding text still gets the strong mark
      const boldNode = nodes.find((n) => n.text === "bold (")!;
      expect(boldNode.marks).toContainEqual({ type: "strong" });
    });

    it("italic wrapping inline code does not add em to the code node", () => {
      const doc = markdownToAdf("*see `fn()` here*");
      const codeNode = doc.content![0].content!.find((n) => n.text === "fn()")!;
      expect(codeNode.marks).toEqual([{ type: "code" }]);
    });

    it("strikethrough wrapping inline code does not add strike to the code node", () => {
      const doc = markdownToAdf("~~old `value`~~");
      const codeNode = doc.content![0].content!.find((n) => n.text === "value")!;
      expect(codeNode.marks).toEqual([{ type: "code" }]);
    });

    it("colored text wrapping inline code does not add textColor to the code node", () => {
      const doc = markdownToAdf("{color:#ff0000}use `x`{color}");
      const codeNode = doc.content![0].content!.find((n) => n.text === "x")!;
      expect(codeNode.marks).toEqual([{ type: "code" }]);
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

  describe("empty list items", () => {
    // Regression: an empty bullet ("- " with a trailing space and nothing else)
    // used to hang the converter. The outer parser detected the raw line as a
    // list, but parseListBlock trimmed it to "-" and refused to consume it,
    // leaving the cursor stuck and spinning forever.
    it("does not hang on an empty bullet and produces an empty list item", () => {
      const doc = markdownToAdf("- one\n\n- \n\n- three");
      const list = doc.content![0];
      expect(list.type).toBe("bulletList");
      expect(list.content).toHaveLength(3);
      expect(list.content![0].content![0].content![0].text).toBe("one");
      expect(list.content![2].content![0].content![0].text).toBe("three");
    });

    it("does not hang on a trailing empty bullet", () => {
      const doc = markdownToAdf("- one\n- ");
      const list = doc.content![0];
      expect(list.type).toBe("bulletList");
      expect(list.content).toHaveLength(2);
    });

    it("does not hang on an empty ordered item", () => {
      const doc = markdownToAdf("1. first\n2. \n3. third");
      const list = doc.content![0];
      expect(list.type).toBe("orderedList");
      expect(list.content).toHaveLength(3);
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
