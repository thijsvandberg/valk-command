"use client";

import { RichEditor } from "@/components/rich-editor/RichEditor";

// Mirrors EditorApp: the leading H1 (the title) is edited elsewhere, so it is
// stripped from the description editor.
function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^#\s+[^\n]*\n*/, "");
}

interface StoryDraftEditorProps {
  localDraft: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
}

/**
 * Editable draft body for the Epic Writer (BRDG-485): reuses the shared RichEditor
 * (the same editor the Story Writer's EditorApp uses) so the PO can edit the epic's
 * own description and, in-place, a child story's description - rather than a
 * read-only preview.
 *
 * Uses the RichEditor's `borderless` mode so the editor owns its own bounded
 * scroll region (flex-1 + overflow-y-auto), the same independent-scroll pattern as
 * the Story Writer's EditorApp. The previous outer overflow-y-auto did not bound
 * the growing editor, so long drafts could not be scrolled (BRDG-487 #7).
 */
export function StoryDraftEditor({ localDraft, onChange, placeholder }: StoryDraftEditorProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <RichEditor
        value={stripLeadingH1(localDraft)}
        onChange={onChange}
        placeholder={placeholder}
        borderless
        minHeight={160}
      />
    </div>
  );
}
