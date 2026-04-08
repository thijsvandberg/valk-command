import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, NodeSelection } from "prosemirror-state";

export type CalloutType = "info" | "warning" | "error" | "note" | "success";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attrs: { type: CalloutType }) => ReturnType;
      toggleCallout: (attrs: { type: CalloutType }) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

export const CalloutExtension = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  selectable: true,

  addAttributes() {
    return {
      type: {
        default: "info",
        parseHTML: (element) => element.getAttribute("data-callout-type") || "info",
        renderHTML: (attributes) => ({
          "data-callout-type": attributes.type,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout-type]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "callout-block" }),
      0,
    ];
  },

  addStorage() {
    return {
      markdown: {
        // Serialize callout nodes directly to :::type fences so tiptap-markdown
        // doesn't fall back to HTML (which loses content when nested inside expand).
        serialize(state: any, node: any) {
          state.write(`:::${node.attrs.type}\n`);
          state.renderContent(node);
          state.ensureNewLine();
          state.write(":::");
          state.closeBlock(node);
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          // handleClickOn fires for each node in the click path (direct=false for ancestors).
          // We intercept clicks on callout ancestors to select the whole block as a node,
          // unless the callout is already node-selected (second click enters text cursor mode).
          handleClickOn(view, _pos, node, nodePos, _event, direct) {
            if (direct || node.type.name !== "callout") return false;
            const sel = view.state.selection;
            if (sel instanceof NodeSelection && sel.from === nodePos) return false;
            view.dispatch(
              view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos))
            );
            return true;
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ commands }) =>
          commands.wrapIn(this.name, attrs),
      toggleCallout:
        (attrs) =>
        ({ commands }) =>
          commands.toggleWrap(this.name, attrs),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});
