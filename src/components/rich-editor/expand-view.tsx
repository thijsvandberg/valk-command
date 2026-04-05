import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { ChevronRight } from "lucide-react";

export function ExpandNodeView({ node, updateAttributes }: NodeViewProps) {
  return (
    <NodeViewWrapper className="expand-block">
      <div className="expand-title-bar" contentEditable={false}>
        <ChevronRight className="expand-chevron" size={14} strokeWidth={1.5} />
        <input
          type="text"
          value={node.attrs.title || ""}
          onChange={(e) => updateAttributes({ title: e.target.value })}
          placeholder="Section title"
          className="expand-title-input"
        />
      </div>
      <NodeViewContent className="expand-content" />
    </NodeViewWrapper>
  );
}
