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
 */
export function StoryDraftEditor({ localDraft, onChange, placeholder }: StoryDraftEditorProps) {
  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-3">
      <RichEditor
        value={stripLeadingH1(localDraft)}
        onChange={onChange}
        placeholder={placeholder}
        minHeight={160}
      />
    </div>
  );
}
