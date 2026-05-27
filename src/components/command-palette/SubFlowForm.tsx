"use client";

import React from "react";
import { Plus, Link, ChevronDown, ArrowRight } from "lucide-react";

import type { SubFlowState } from "./types";

export interface SubFlowFormProps {
  subFlow: Extract<SubFlowState, { kind: "new-story" }>;
  subFlowInputRef: React.RefObject<HTMLInputElement | null>;
  onModeChange: (mode: "create" | "existing") => void;
  onTitleChange: (title: string) => void;
  onSprintChange: (sprintId: string) => void;
  onExistingKeyChange: (key: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SubFlowForm({
  subFlow,
  subFlowInputRef,
  onModeChange,
  onTitleChange,
  onSprintChange,
  onExistingKeyChange,
  onConfirm,
  onCancel,
}: SubFlowFormProps) {
  return (
    <div className="p-4">
      {/* Mode toggle */}
      <div className="mb-4 flex gap-1 rounded-lg bg-overlay-subtle p-1">
        <button
          type="button"
          onClick={() => onModeChange("create")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-body-sm font-medium cursor-pointer transition-colors duration-150 ${
            subFlow.mode === "create"
              ? "bg-[var(--color-surface-floating)] text-text-primary shadow-sm"
              : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          <Plus size={12} strokeWidth={2} />
          Create new
        </button>
        <button
          type="button"
          onClick={() => onModeChange("existing")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-body-sm font-medium cursor-pointer transition-colors duration-150 ${
            subFlow.mode === "existing"
              ? "bg-[var(--color-surface-floating)] text-text-primary shadow-sm"
              : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          <Link size={12} strokeWidth={2} />
          Use existing
        </button>
      </div>

      {/* Create new form */}
      {subFlow.mode === "create" && (
        <div className="mb-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-label font-medium text-text-tertiary">
              Story title
            </label>
            <input
              ref={subFlowInputRef}
              type="text"
              value={subFlow.title}
              onChange={(e) => onTitleChange(e.target.value)}
              className="w-full rounded-md border border-border-strong bg-[var(--color-surface-floating)] px-3 py-2 text-body-lg text-text-primary placeholder-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none transition-colors duration-150"
              placeholder="Story title (optional, AI will suggest)"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-label font-medium text-text-tertiary">
              Sprint
            </label>
            <div className="relative">
              <select
                value={subFlow.sprintId}
                onChange={(e) => onSprintChange(e.target.value)}
                className="w-full appearance-none rounded-md border border-border-strong bg-[var(--color-surface-floating)] px-3 py-2 pr-8 text-body-lg text-text-primary focus:border-[var(--color-brand-500)]/40 focus:outline-none transition-colors duration-150 cursor-pointer"
              >
                {subFlow.loadingSprints ? (
                  <option value="">Loading sprints...</option>
                ) : subFlow.sprints.length === 0 ? (
                  <option value="">No sprints configured</option>
                ) : (
                  subFlow.sprints.map((s) => (
                    <option key={s.sprintId} value={s.sprintId}>
                      {s.sprintName}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown
                size={13}
                strokeWidth={1.5}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
              />
            </div>
          </div>
        </div>
      )}

      {/* Use existing form */}
      {subFlow.mode === "existing" && (
        <div className="mb-4">
          <label className="mb-1.5 block text-label font-medium text-text-tertiary">
            Ticket key
          </label>
          <input
            ref={subFlowInputRef}
            type="text"
            value={subFlow.existingKey}
            onChange={(e) => onExistingKeyChange(e.target.value.toUpperCase())}
            className="w-full rounded-md border border-border-strong bg-[var(--color-surface-floating)] px-3 py-2 font-mono text-body-lg text-text-primary placeholder-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none transition-colors duration-150"
            placeholder="VPL-123"
          />
          <p className="mt-1.5 text-label text-text-tertiary">
            The ticket must be synced locally.
          </p>
        </div>
      )}

      {/* Inline error */}
      {subFlow.error && (
        <p className="mb-4 rounded-md bg-red-500/[0.08] px-3 py-2 text-body-sm text-red-400/80">
          {subFlow.error}
        </p>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={subFlow.loading}
          className="px-3 py-1.5 text-body-lg text-text-tertiary hover:text-text-secondary disabled:opacity-40 transition-colors duration-150 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={subFlow.loading}
          className="flex items-center gap-1.5 rounded-md bg-[var(--color-brand-600)] px-4 py-1.5 text-body-lg font-medium text-white hover:bg-[var(--color-brand-500)] disabled:opacity-50 transition-colors duration-150 cursor-pointer"
        >
          {subFlow.loading ? (
            <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-border-strong border-t-white/80 animate-spin" />
          ) : subFlow.mode === "create" ? (
            <Plus size={13} strokeWidth={2} />
          ) : (
            <ArrowRight size={13} strokeWidth={1.5} />
          )}
          {subFlow.mode === "create" ? "Create" : "Open"}
        </button>
      </div>
    </div>
  );
}
