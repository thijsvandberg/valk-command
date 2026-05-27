"use client";

import { useState } from "react";
import { redirect } from "next/navigation";

import { IssueTypePicker } from "@/components/shared/IssueTypePicker";
import { AssigneePicker } from "@/components/shared/AssigneePicker";
import { LabelPicker } from "@/components/shared/LabelPicker";
import { StoryPointPicker } from "@/components/shared/StoryPointPicker";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { SprintPicker } from "@/components/shared/SprintPicker";
import { EpicPicker } from "@/components/shared/EpicPicker";
import { VersionPicker } from "@/components/shared/VersionPicker";

import type { IssueType, Assignee } from "@/types/ticket";
import type { EpicOption } from "@/components/shared/EpicPicker";
import type { VersionOption } from "@/components/shared/VersionPicker";

if (process.env.NODE_ENV === "production") {
  redirect("/");
}

const MOCK_SPRINTS = [
  { id: 100, name: "Sprint 23", state: "active", startDate: "2026-05-19", endDate: "2026-06-02" },
  { id: 101, name: "Sprint 24", state: "future", startDate: "2026-06-02", endDate: "2026-06-16" },
  { id: 102, name: "Sprint 25", state: "future", startDate: "2026-06-16", endDate: "2026-06-30" },
];

const MOCK_VERSIONS: VersionOption[] = [
  { id: "v1", label: "v3 (current)", versionNum: 3, title: "Current Jira version", tag: "current", isoDate: "2026-05-20T10:00:00" },
  { id: "v2", label: "v2", versionNum: 2, title: "Previous version", tag: "jira", isoDate: "2026-05-15T14:30:00" },
  { id: "v3", label: "AI Draft", title: "AI-generated story", tag: "ai-draft", group: "Drafts" },
  { id: "v4", label: "Manual Draft", title: "Manual draft", tag: "draft", group: "Drafts" },
];

function PickerRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-6 border-b border-border-subtle py-4">
      <div className="w-[160px] shrink-0 text-sm font-medium text-text-secondary">{label}</div>
      <div>{children}</div>
    </div>
  );
}

export default function PickersShowcasePage() {
  const [issueType, setIssueType] = useState<IssueType>("story");
  const [assignee, setAssignee] = useState<Assignee | null>(null);
  const [labels, setLabels] = useState<string[]>(["frontend"]);
  const [sp, setSp] = useState<number | null>(3);
  const [bv, setBv] = useState<number | null>(5);
  const [sprint, setSprint] = useState<string | null>("100");
  const [epic, setEpic] = useState<EpicOption | null>(null);
  const [versionId, setVersionId] = useState("v1");

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="mb-2 text-xl font-semibold text-text-primary" style={{ fontFamily: "var(--font-heading)" }}>
        Picker Showcase
      </h1>
      <p className="mb-8 text-sm text-text-tertiary">
        All pickers built on BasePicker compound component. Dev-only page.
      </p>

      <div className="rounded-xl border border-border-default bg-[var(--color-surface-elevated)] p-6">
        <PickerRow label="IssueTypePicker">
          <IssueTypePicker type={issueType} onTypeChange={setIssueType} />
        </PickerRow>

        <PickerRow label="AssigneePicker">
          <AssigneePicker value={assignee} onChange={(u) => setAssignee(u ? { name: u.displayName, initials: u.displayName.slice(0, 2).toUpperCase(), color: "#888" } : null)} align="left" />
        </PickerRow>

        <PickerRow label="LabelPicker">
          <LabelPicker value={labels} onChange={setLabels} align="left" />
        </PickerRow>

        <PickerRow label="StoryPointPicker">
          <StoryPointPicker value={sp} onChange={setSp} align="left" />
        </PickerRow>

        <PickerRow label="BusinessValuePicker">
          <BusinessValuePicker value={bv} onChange={setBv} align="left" />
        </PickerRow>

        <PickerRow label="SprintPicker">
          <SprintPicker value={sprint} sprints={MOCK_SPRINTS} onChange={setSprint} align="left" />
        </PickerRow>

        <PickerRow label="EpicPicker">
          <EpicPicker value={epic} onChange={setEpic} align="left" />
        </PickerRow>

        <PickerRow label="VersionPicker">
          <VersionPicker options={MOCK_VERSIONS} selectedId={versionId} onSelect={setVersionId} align="left" />
        </PickerRow>
      </div>
    </div>
  );
}
