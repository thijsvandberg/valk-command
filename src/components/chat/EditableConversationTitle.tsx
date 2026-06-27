"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { PenLine } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

interface EditableConversationTitleProps {
  conversationId: string;
  title: string;
  onTitleSaved: () => void;
}

export function EditableConversationTitle({
  conversationId,
  title,
  onTitleSaved,
}: EditableConversationTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const startEditing = useCallback(() => {
    setEditValue(title);
    setIsEditing(true);
  }, [title]);

  const save = useCallback(async () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === title) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        body: { title: trimmed },
      });
      onTitleSaved();
    } catch (err) {
      console.warn("[chat] rename failed", err);
    } finally {
      setSaving(false);
      setIsEditing(false);
    }
  }, [editValue, title, conversationId, onTitleSaved]);

  const cancel = useCallback(() => {
    setEditValue(title);
    setIsEditing(false);
  }, [title]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    },
    [save, cancel]
  );

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={save}
        disabled={saving}
        className="min-w-0 flex-1 font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary bg-transparent border-b border-[var(--color-brand-400)]/40 outline-none py-0 px-0 disabled:opacity-50"
        data-testid="title-input"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className="group/title flex min-w-0 items-center gap-1.5 font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary cursor-pointer hover:text-text-secondary transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      data-testid="editable-title"
    >
      <span className="truncate">{title}</span>
      <PenLine
        size={12}
        strokeWidth={1.5}
        className="shrink-0 opacity-0 group-hover/title:opacity-50 transition-opacity duration-150"
      />
    </button>
  );
}
