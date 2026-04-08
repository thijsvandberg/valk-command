import { Extension } from "@tiptap/core";
import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

// Adds an "in-text-selection" class to image and callout nodes that fall within
// a text selection range. ProseMirror only highlights text via ::selection, so
// these block-level nodes need explicit decoration to show they are included.
export const SelectionDecorationExtension = Extension.create({
  name: "selectionDecoration",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const { selection, doc } = state;
            const { from, to } = selection;

            if (from === to) return DecorationSet.empty;

            const decorations: Decoration[] = [];

            doc.nodesBetween(from, to, (node, pos) => {
              if (node.type.name === "image" || node.type.name === "callout") {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: "in-text-selection",
                  })
                );
              }
            });

            if (decorations.length === 0) return DecorationSet.empty;
            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
