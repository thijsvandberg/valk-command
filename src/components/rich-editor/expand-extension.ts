import { Node, mergeAttributes } from "@tiptap/core";

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
    return [{ tag: "details[data-expand-title]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "details",
      mergeAttributes(HTMLAttributes, { class: "expand-block" }),
      0,
    ];
  },

  addCommands() {
    return {
      setExpand:
        (attrs) =>
        ({ commands }) =>
          commands.wrapIn(this.name, attrs),
      toggleExpand:
        (attrs) =>
        ({ commands }) =>
          commands.toggleWrap(this.name, attrs),
      unsetExpand:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});
