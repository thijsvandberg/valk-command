"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Tag } from "@/components/shared/Tag";
import { tickets } from "@/lib/api-client";

export function EditableTitle({
  ticketKey,
  initialTitle,
  serverLocalEdit,
  onLocalEdit,
  onEditingChange,
}: {
  ticketKey: string;
  initialTitle: string;
  serverLocalEdit?: { value: string; isDraft: boolean };
  onLocalEdit: (hasEdit: boolean) => void;
  onEditingChange?: (isEditing: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  // Persisted local edit - only updated on save, drives the "Locally modified" badge
  const [localValue, setLocalValue] = useState<string | null>(serverLocalEdit?.value ?? null);
  // In-progress value while the textarea is open - never persisted until save
  const [editDraft, setEditDraft] = useState<string>("");
  // Ref mirror so save() always reads the latest draft regardless of closure age
  const editDraftRef = useRef(editDraft);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const notifiedRef = useRef(false);
  // Set before an intentional discard (Escape) so onBlur skips saving
  const discardingRef = useRef(false);
  // Set during an in-flight save so a subsequent onBlur doesn't double-save
  const savingRef = useRef(false);

  const hasLocalEdit = localValue !== null;
  // Display value when not editing
  const displayValue = localValue ?? initialTitle;

  useEffect(() => { onEditingChange?.(editing); }, [editing, onEditingChange]);

  // Notify parent once if we have a server-provided local edit
  useEffect(() => {
    if (serverLocalEdit && !notifiedRef.current) {
      notifiedRef.current = true;
      onLocalEdit(true);
    }
  }, [serverLocalEdit, onLocalEdit]);

  useEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      // Position cursor at end so backspace deletes one character at a time
      el.setSelectionRange(el.value.length, el.value.length);
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editing]);

  const startEditing = () => {
    const draft = localValue ?? initialTitle;
    setEditDraft(draft);
    editDraftRef.current = draft;
    // Reset in case a previous save fetch is still in-flight
    savingRef.current = false;
    setEditing(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditDraft(e.target.value);
    editDraftRef.current = e.target.value;
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const discard = () => {
    discardingRef.current = true;
    setEditing(false);
    // editDraft is simply abandoned - localValue stays unchanged
  };

  const save = useCallback(async () => {
    if (discardingRef.current) { discardingRef.current = false; return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setEditing(false);
    const draft = editDraftRef.current.trim();
    try {
      // Empty title: discard silently, don't persist garbage
      if (draft === "") {
        return;
      }
      if (draft === initialTitle) {
        setLocalValue(null);
        onLocalEdit(false);
        return;
      }
      await tickets.saveLocalEdit(ticketKey, { field: "title", localValue: draft });
      setLocalValue(draft);
      onLocalEdit(true);
    } catch (err) {
      console.error("Operation failed:", err);
    } finally {
      savingRef.current = false;
    }
  }, [ticketKey, initialTitle, onLocalEdit]);

  if (editing) {
    return (
      <textarea
        ref={inputRef}
        rows={1}
        value={editDraft}
        onChange={handleChange}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); save(); }
          if (e.key === "Escape") { e.preventDefault(); discard(); }
        }}
        className="w-full resize-none overflow-hidden border-b-2 border-[var(--color-brand-500)]/40 bg-transparent font-[var(--font-display)] text-3xl font-bold tracking-[-0.03em] leading-tight text-text-primary outline-none"
      />
    );
  }

  return (
    <div className="group flex items-start gap-2">
      <h1
        onClick={startEditing}
        className="font-[var(--font-display)] cursor-pointer text-3xl font-bold tracking-[-0.03em] leading-tight text-text-primary hover:text-text-primary"
        title="Click to edit"
      >
        {displayValue}
      </h1>
      {hasLocalEdit && (
        <Tag color="brand" className="mt-1 shrink-0">Locally modified</Tag>
      )}
    </div>
  );
}
