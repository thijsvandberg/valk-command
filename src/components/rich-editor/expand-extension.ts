import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ExpandNodeView } from "./expand-view";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    expand: {
      setExpand: (attrs: { title: string }) => ReturnType;
      toggleExpand: (attrs: { title: string }) => ReturnType;
      unsetExpand: () => ReturnType;
    };
  }
}

export const ExpandExtension = Node.create({
  name: "expand",
  group: "block",
  content: "block+",

  addAttributes() {
    return {
      title: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-expand-title") || "",
        renderHTML: (attributes) => ({
          "data-expand-title": attributes.title,
        }),
      },
    };
  },

  parseHTML() {
    // Content lives in the inner <div>; without contentElement ProseMirror also
    // parses the <summary> text as a child block, duplicating the title into the
    // body on every load->serialize cycle (the recurring extra "Expand" line).
    return [
      {
        tag: "details[data-expand-title]",
        contentElement: (element) => element.querySelector("div") ?? (element as HTMLElement),
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const title = node.attrs.title || "Details";
    return [
      "details",
      mergeAttributes(HTMLAttributes, { class: "expand-block" }),
      ["summary", {}, title],
      ["div", {}, 0],
    ];
  },

  addStorage() {
    return {
      markdown: {
        // Serialize expand nodes directly to :::expand fences so tiptap-markdown
        // doesn't fall back to HTML (which loses nested callout children).
        serialize(state: any, node: any) {
          state.write(`:::expand ${node.attrs.title || ""}\n`);
          state.renderContent(node);
          state.ensureNewLine();
          state.write(":::");
          state.closeBlock(node);
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ExpandNodeView);
  },

  addCommands() {
    return {
      setExpand:
        (attrs) =>
        ({ commands, state }) => {
          // Prevent nesting: bail if already inside an expand node
          const { $from } = state.selection;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === "expand") return false;
          }
          return commands.wrapIn(this.name, attrs);
        },
      toggleExpand:
        (attrs) =>
        ({ commands, state }) => {
          const { $from } = state.selection;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === "expand") return false;
          }
          return commands.toggleWrap(this.name, attrs);
        },
      unsetExpand:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});
