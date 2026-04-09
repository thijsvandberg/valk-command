"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Code2, Save, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { TabBar, Tab } from "@/components/shared/TabBar";
import type { IssueType } from "@/types/ticket";
import type { QuickPrompt, QuickPromptsConfig } from "@/app/api/settings/quick-prompts/route";

const ISSUE_TYPES: { type: IssueType; label: string }[] = [
  { type: "story", label: "Story" },
  { type: "bug", label: "Bug" },
  { type: "task", label: "Task" },
  { type: "spike", label: "Spike" },
];

function SortablePromptRow({
  prompt,
  onUpdate,
  onRemove,
}: {
  prompt: QuickPrompt;
  onUpdate: (id: string, field: keyof QuickPrompt, value: string | boolean) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: prompt.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 flex flex-col gap-3"
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="text-white/20 hover:text-white/50 cursor-grab active:cursor-grabbing transition-colors duration-150 touch-none"
          tabIndex={-1}
        >
          <GripVertical size={14} strokeWidth={1.5} />
        </button>
        <input
          value={prompt.label}
          onChange={(e) => onUpdate(prompt.id, "label", e.target.value)}
          placeholder="Button label"
          className="w-44 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-white/80 placeholder-white/25 focus:outline-none focus:border-[var(--color-brand-500)]/40 transition-colors duration-150"
        />
        <button
          onClick={() => onUpdate(prompt.id, "enableCodebase", !prompt.enableCodebase)}
          title="Toggle codebase research"
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors duration-150 cursor-pointer ${
            prompt.enableCodebase
              ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]"
              : "border-white/[0.08] bg-white/[0.03] text-white/35 hover:text-white/60"
          }`}
        >
          <Code2 size={11} strokeWidth={1.5} />
          Codebase
        </button>
        <button
          onClick={() => onRemove(prompt.id)}
          className="ml-auto rounded-lg p-1.5 text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-colors duration-150 cursor-pointer"
        >
          <Trash2 size={14} strokeWidth={1.5} />
        </button>
      </div>
      <textarea
        value={prompt.text}
        onChange={(e) => onUpdate(prompt.id, "text", e.target.value)}
        placeholder="Prompt text sent to the AI..."
        rows={2}
        className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white/80 placeholder-white/25 focus:outline-none focus:border-[var(--color-brand-500)]/40 transition-colors duration-150 leading-[1.6]"
      />
    </div>
  );
}

export default function PromptsPage() {
  const [config, setConfig] = useState<QuickPromptsConfig>({});
  const [activeType, setActiveType] = useState<IssueType>("story");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    fetch("/api/settings/quick-prompts")
      .then((r) => r.json())
      .then((data: { prompts: QuickPromptsConfig }) => {
        setConfig(data.prompts ?? {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const prompts = config[activeType] ?? [];

  const updatePrompt = useCallback(
    (id: string, field: keyof QuickPrompt, value: string | boolean) => {
      setConfig((prev) => ({
        ...prev,
        [activeType]: (prev[activeType] ?? []).map((p) =>
          p.id === id ? { ...p, [field]: value } : p
        ),
      }));
      setSaved(false);
    },
    [activeType]
  );

  const addPrompt = useCallback(() => {
    const id = crypto.randomUUID();
    setConfig((prev) => ({
      ...prev,
      [activeType]: [...(prev[activeType] ?? []), { id, label: "", text: "" }],
    }));
    setSaved(false);
  }, [activeType]);

  const removePrompt = useCallback(
    (id: string) => {
      setConfig((prev) => ({
        ...prev,
        [activeType]: (prev[activeType] ?? []).filter((p) => p.id !== id),
      }));
      setSaved(false);
    },
    [activeType]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setConfig((prev) => {
        const items = prev[activeType] ?? [];
        const oldIndex = items.findIndex((p) => p.id === active.id);
        const newIndex = items.findIndex((p) => p.id === over.id);
        return { ...prev, [activeType]: arrayMove(items, oldIndex, newIndex) };
      });
      setSaved(false);
    },
    [activeType]
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/quick-prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompts: config }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }, [config]);

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-medium text-white/50 uppercase tracking-[0.06em]">
          Story Writer Quick Prompts
        </h2>
        <button
          onClick={save}
          disabled={saving || saved}
          className="flex h-7 items-center gap-2 rounded-md border border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10 px-3 text-xs font-medium text-[var(--color-brand-400)] hover:bg-[var(--color-brand-500)]/20 active:scale-[0.97] transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <Save size={13} strokeWidth={1.5} />
          {saving ? "Saving..." : saved ? "Saved" : "Save changes"}
        </button>
      </div>

      <TabBar className="mb-6">
        {ISSUE_TYPES.map(({ type, label }) => (
          <Tab
            key={type}
            active={activeType === type}
            onClick={() => setActiveType(type)}
            icon={<IssueTypeIcon type={type} size={11} />}
            label={label}
          />
        ))}
      </TabBar>

      {loading ? (
        <div className="text-sm text-white/30">Loading...</div>
      ) : (
        <div className="flex flex-col gap-3">
          {prompts.length === 0 && (
            <p className="text-sm text-white/30 py-1">
              No quick prompts configured for this issue type.
            </p>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={prompts.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {prompts.map((prompt) => (
                <SortablePromptRow
                  key={prompt.id}
                  prompt={prompt}
                  onUpdate={updatePrompt}
                  onRemove={removePrompt}
                />
              ))}
            </SortableContext>
          </DndContext>

          <button
            onClick={addPrompt}
            className="flex items-center gap-2 self-start rounded-lg border border-dashed border-white/[0.12] px-3 py-2 text-sm text-white/40 hover:text-white/65 hover:border-white/[0.22] transition-colors duration-150 cursor-pointer mt-1"
          >
            <Plus size={14} strokeWidth={1.5} />
            Add prompt
          </button>
        </div>
      )}
    </>
  );
}
