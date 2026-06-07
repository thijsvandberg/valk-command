"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useWriterContext } from "../WriterContext";
import { usePaneContext } from "../PaneContext";
import { AssigneePicker } from "@/components/shared/AssigneePicker";
import { WatchersRow } from "@/components/shared/WatchersRow";
import { SprintPicker } from "@/components/shared/SprintPicker";
import { EpicPicker } from "@/components/shared/EpicPicker";
import type { EpicOption } from "@/components/shared/EpicPicker";
import { StoryPointPicker } from "@/components/shared/StoryPointPicker";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { LabelPicker } from "@/components/shared/LabelPicker";
import { Avatar } from "@/components/shared/Avatar";
import { Tag } from "@/components/shared/Tag";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { relativeDate } from "@/lib/date-utils";

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="shrink-0 text-body-sm text-text-tertiary">{label}</span>
      <div className="min-w-0 text-right text-body-lg text-text-secondary">{children}</div>
    </div>
  );
}

function MetaSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">{title}</h3>
      <div className="rounded-lg border border-border-subtle bg-[var(--color-surface-elevated)] px-3.5 py-1">
        {children}
      </div>
    </div>
  );
}

export function MetaApp() {
  const writer = useWriterContext();
  const { registerToolbar, unregisterToolbar } = usePaneContext();
  const { sprints: rawSprints } = useJiraSprints();

  useEffect(() => {
    registerToolbar("meta", { label: "Meta" });
    return () => unregisterToolbar("meta");
  }, [registerToolbar, unregisterToolbar]);

  const ticket = writer.ticketData;
  const detail = writer.ticketDetail;

  // Labels needs local state for optimistic multi-toggle; other pickers
  // handle their own visual state and SWR revalidates quickly.
  const serverLabels = detail?.labels ?? [];
  const labelsRef = useRef(serverLabels);
  const [localLabels, setLocalLabels] = useState<string[]>(serverLabels);
  if (labelsRef.current !== serverLabels) {
    labelsRef.current = serverLabels;
    setLocalLabels(serverLabels);
  }

  const handleAssigneeChange = useCallback(async (user: { accountId: string | null; displayName: string; avatarUrl: string | null } | null) => {
    await writer.onAssigneeChange(user);
  }, [writer]);

  const handleSprintChange = useCallback(async (sprintId: string | null) => {
    await writer.onSprintChange(sprintId);
  }, [writer]);

  const handleEpicChange = useCallback(async (epic: EpicOption | null) => {
    await writer.onApplyEpic(epic?.key ?? "");
  }, [writer]);

  const handleStoryPointsChange = useCallback(async (v: number | null) => {
    await writer.onStoryPointsChange(v);
  }, [writer]);

  const handleBusinessValueChange = useCallback(async (v: number | null) => {
    await writer.onBusinessValueChange(v);
  }, [writer]);

  const handleLabelsChange = useCallback(async (newLabels: string[]) => {
    const prev = localLabels;
    setLocalLabels(newLabels);
    try {
      await writer.onLabelsChange(newLabels);
    } catch {
      setLocalLabels(prev);
    }
  }, [writer, localLabels]);

  if (!ticket) {
    return (
      <div className="flex h-full items-center justify-center text-body-sm text-text-muted">
        Loading...
      </div>
    );
  }

  const reporter = detail?.reporter ?? null;
  const createdAt = detail?.createdAt ?? null;
  const updatedAt = detail?.updatedAt ?? null;
  const priority = detail?.priority ?? null;
  const sprintId = ticket.sprintId ?? null;

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-4 space-y-4">

      {/* People */}
      <MetaSection title="People">
        <MetaRow label="Assignee">
          <AssigneePicker
            value={ticket.assignee}
            onChange={handleAssigneeChange}
            align="right"
          />
        </MetaRow>
        <MetaRow label="Watchers">
          <WatchersRow ticketKey={writer.ticketKey} align="right" />
        </MetaRow>
        <MetaRow label="Reporter">
          {reporter ? (
            <span className="inline-flex items-center gap-2">
              <span className="truncate text-body-lg text-text-secondary">{reporter.name}</span>
              <Avatar assignee={reporter} size={20} />
            </span>
          ) : (
            <span className="text-body-sm text-text-muted">Unknown</span>
          )}
        </MetaRow>
      </MetaSection>

      {/* Scoring */}
      <div>
        <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">Scoring</h3>
        <div className="grid grid-cols-2 gap-2">
          <div
            className="rounded-lg border border-border-subtle px-3 py-2"
            style={{
              backgroundColor: ticket.storyPoints != null
                ? "color-mix(in srgb, var(--color-brand-500) 4%, var(--color-surface-elevated))"
                : "var(--color-overlay-subtle)",
              transition: "background-color 0.15s ease",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-caption text-text-muted">Story Points</span>
              <StoryPointPicker
                value={ticket.storyPoints}
                onChange={handleStoryPointsChange}
              />
            </div>
          </div>
          <div
            className="rounded-lg border border-border-subtle px-3 py-2"
            style={{
              backgroundColor: ticket.businessValue != null
                ? "color-mix(in srgb, var(--color-brand-500) 4%, var(--color-surface-elevated))"
                : "var(--color-overlay-subtle)",
              transition: "background-color 0.15s ease",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-caption text-text-muted">Business Value</span>
              <BusinessValuePicker
                value={ticket.businessValue}
                onChange={handleBusinessValueChange}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Planning */}
      <MetaSection title="Planning">
        <MetaRow label="Sprint">
          <SprintPicker
            value={sprintId}
            sprints={rawSprints ?? []}
            onChange={handleSprintChange}
            align="right"
          />
        </MetaRow>
        {ticket.type !== "epic" && ticket.type !== "subtask" && (
          <MetaRow label="Epic">
            <EpicPicker
              value={ticket.epicKey ? { key: ticket.epicKey, name: ticket.epic ?? ticket.epicKey } : null}
              onChange={handleEpicChange}
              align="right"
              ticketKey={writer.ticketKey}
            />
          </MetaRow>
        )}
        {priority && (
          <MetaRow label="Priority">
            <span className="text-body-sm text-text-secondary">{priority}</span>
          </MetaRow>
        )}
      </MetaSection>

      {/* Labels */}
      <MetaSection title="Labels">
        <div className="py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1 min-w-0 flex-1">
              {localLabels.length > 0 ? (
                localLabels.map((l) => <Tag key={l}>{l}</Tag>)
              ) : (
                <span className="text-body-sm text-text-muted">No labels</span>
              )}
            </div>
            <LabelPicker
              value={localLabels}
              onChange={handleLabelsChange}
              align="right"
            />
          </div>
        </div>
      </MetaSection>

      {/* Timestamps */}
      {(createdAt || updatedAt) && (
        <MetaSection title="Dates">
          {createdAt && (
            <MetaRow label="Created">
              <span className="text-body-sm text-text-tertiary">{relativeDate(createdAt)}</span>
            </MetaRow>
          )}
          {updatedAt && (
            <MetaRow label="Updated">
              <span className="text-body-sm text-text-tertiary">{relativeDate(updatedAt)}</span>
            </MetaRow>
          )}
        </MetaSection>
      )}
    </div>
  );
}
