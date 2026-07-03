"use client";

import { useState, useRef, useCallback } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { Columns3, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/shared/Checkbox";
import { COLUMNS } from "@/components/sprint-board/filter-bar-types";
import type { ColumnId } from "@/components/sprint-board/filter-bar-types";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableColumnItem({
  colDef,
  checked,
  onToggle,
}: {
  colDef: { id: ColumnId; label: string };
  checked: boolean;
  onToggle: (id: ColumnId, show: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: colDef.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex w-full items-center gap-1.5 pr-3.5 py-1 text-body text-text-secondary hover:bg-hover-list-item hover:text-text-primary"
    >
      <div
        className="flex shrink-0 items-center justify-center w-7 h-7 cursor-grab active:cursor-grabbing text-text-muted hover:text-text-tertiary"
        {...listeners}
        {...attributes}
      >
        <GripVertical size={12} strokeWidth={1.5} />
      </div>
      <label
        className="flex flex-1 items-center gap-3 cursor-pointer select-none"
      >
        <Checkbox checked={checked} />
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(colDef.id, e.target.checked)}
          className="sr-only"
        />
        {colDef.label}
      </label>
    </div>
  );
}

const COLUMN_LABEL_MAP: Record<ColumnId, string> = Object.fromEntries(
  COLUMNS.map((c) => [c.id, c.label]),
) as Record<ColumnId, string>;

export function ColumnToggle({
  visible,
  order,
  onChange,
  onReorder,
  onReset,
}: {
  visible: Set<ColumnId>;
  order: ColumnId[];
  onChange: (id: ColumnId, show: boolean) => void;
  onReorder: (activeId: ColumnId, overId: ColumnId) => void;
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClick(ref, () => setOpen(false), { enabled: open });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        onReorder(active.id as ColumnId, over.id as ColumnId);
      }
    },
    [onReorder],
  );

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="md"
        iconOnly
        onClick={() => setOpen(!open)}
        icon={<Columns3 className="h-3.5 w-3.5" strokeWidth={1.5} />}
        title="Toggle columns"
        aria-label="Toggle columns"
        className="border-0 bg-transparent text-text-tertiary hover:bg-hover-list-item hover:text-text-secondary"
      />
      {open && (
        <div className="absolute top-full right-0 z-dropdown mt-1.5 w-56 rounded-xl border border-border-strong bg-surface-floating shadow-xl overflow-hidden flex flex-col">
          <div className="overflow-y-auto max-h-[70vh] py-1.5">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={order} strategy={verticalListSortingStrategy}>
                {order.map((id) => (
                  <SortableColumnItem
                    key={id}
                    colDef={{ id, label: COLUMN_LABEL_MAP[id] }}
                    checked={visible.has(id)}
                    onToggle={onChange}
                  />
                ))}
              </SortableContext>
            </DndContext>
            {COLUMNS.filter((c) => !order.includes(c.id)).length > 0 && (
              <>
                <div className="my-1 h-px bg-overlay-default" />
                {COLUMNS.filter((c) => !order.includes(c.id)).map((c) => (
                  <div
                    key={c.id}
                    className="flex w-full items-center gap-1.5 pr-3.5 py-1 text-body text-text-tertiary hover:bg-hover-list-item hover:text-text-secondary"
                  >
                    <div className="flex shrink-0 items-center justify-center w-7 h-7 text-text-muted">
                      <GripVertical size={12} strokeWidth={1.5} />
                    </div>
                    <label className="flex flex-1 items-center gap-3 cursor-pointer select-none">
                      <Checkbox checked={false} />
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => onChange(c.id, true)}
                        className="sr-only"
                      />
                      {c.label}
                    </label>
                  </div>
                ))}
              </>
            )}
          </div>
          {onReset && (
            <>
              <div className="h-px bg-overlay-default" />
              <button
                type="button"
                onClick={() => { onReset(); setOpen(false); }}
                className="flex w-full items-center px-3.5 py-1.5 text-body-sm text-text-tertiary cursor-pointer hover:bg-hover-list-item hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                Reset to default
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
