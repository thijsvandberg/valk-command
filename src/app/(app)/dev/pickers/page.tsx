"use client";

import { useState } from "react";
import { redirect } from "next/navigation";

// Original pickers
import { IssueTypePicker } from "@/components/shared/IssueTypePicker";
import { AssigneePicker } from "@/components/shared/AssigneePicker";
import { LabelPicker } from "@/components/shared/LabelPicker";
import { StoryPointPicker } from "@/components/shared/StoryPointPicker";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { SprintPicker } from "@/components/shared/SprintPicker";
import { EpicPicker } from "@/components/shared/EpicPicker";
import { VersionPicker } from "@/components/shared/VersionPicker";

// V2 pickers (BasePicker-based)
import { IssueTypePickerV2 } from "@/components/shared/pickers/IssueTypePickerV2";
import { AssigneePickerV2 } from "@/components/shared/pickers/AssigneePickerV2";
import { LabelPickerV2 } from "@/components/shared/pickers/LabelPickerV2";
import { StoryPointPickerV2 } from "@/components/shared/pickers/StoryPointPickerV2";
import { BusinessValuePickerV2 } from "@/components/shared/pickers/BusinessValuePickerV2";
import { SprintPickerV2 } from "@/components/shared/pickers/SprintPickerV2";
import { EpicPickerV2 } from "@/components/shared/pickers/EpicPickerV2";
import { VersionPickerV2 } from "@/components/shared/pickers/VersionPickerV2";

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
    <div className="grid grid-cols-[180px_1fr_1fr] items-center gap-6 border-b border-border-subtle py-4">
      <div className="text-sm font-medium text-text-secondary">{label}</div>
      {children}
    </div>
  );
}

export default function PickersShowcasePage() {
  // IssueType state
  const [issueType, setIssueType] = useState<IssueType>("story");
  const [issueTypeV2, setIssueTypeV2] = useState<IssueType>("story");

  // Assignee state
  const [assignee, setAssignee] = useState<Assignee | null>(null);
  const [assigneeV2, setAssigneeV2] = useState<Assignee | null>(null);

  // Labels state
  const [labels, setLabels] = useState<string[]>(["frontend"]);
  const [labelsV2, setLabelsV2] = useState<string[]>(["frontend"]);

  // StoryPoints state
  const [sp, setSp] = useState<number | null>(3);
  const [spV2, setSpV2] = useState<number | null>(3);

  // BusinessValue state
  const [bv, setBv] = useState<number | null>(5);
  const [bvV2, setBvV2] = useState<number | null>(5);

  // Sprint state
  const [sprint, setSprint] = useState<string | null>("100");
  const [sprintV2, setSprintV2] = useState<string | null>("100");

  // Epic state
  const [epic, setEpic] = useState<EpicOption | null>(null);
  const [epicV2, setEpicV2] = useState<EpicOption | null>(null);

  // Version state
  const [versionId, setVersionId] = useState("v1");
  const [versionIdV2, setVersionIdV2] = useState("v1");

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="mb-2 text-xl font-semibold text-text-primary" style={{ fontFamily: "var(--font-heading)" }}>
        Picker Showcase
      </h1>
      <p className="mb-8 text-sm text-text-tertiary">
        Side-by-side comparison of original pickers (left) vs BasePicker-based versions (right).
        Dev-only page, excluded from production.
      </p>

      <div className="rounded-xl border border-border-default bg-[var(--color-surface-elevated)] p-6">
        {/* Header row */}
        <div className="grid grid-cols-[180px_1fr_1fr] gap-6 border-b border-border-default pb-3 mb-2">
          <div />
          <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">Original</div>
          <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">BasePicker V2</div>
        </div>

        <PickerRow label="IssueTypePicker">
          <div><IssueTypePicker type={issueType} onTypeChange={setIssueType} /></div>
          <div><IssueTypePickerV2 type={issueTypeV2} onTypeChange={setIssueTypeV2} /></div>
        </PickerRow>

        <PickerRow label="AssigneePicker">
          <div><AssigneePicker value={assignee} onChange={(u) => setAssignee(u ? { name: u.displayName, initials: u.displayName.slice(0, 2).toUpperCase(), color: "#888" } : null)} align="left" /></div>
          <div><AssigneePickerV2 value={assigneeV2} onChange={(u) => setAssigneeV2(u ? { name: u.displayName, initials: u.displayName.slice(0, 2).toUpperCase(), color: "#888" } : null)} align="left" /></div>
        </PickerRow>

        <PickerRow label="LabelPicker">
          <div><LabelPicker value={labels} onChange={setLabels} align="left" /></div>
          <div><LabelPickerV2 value={labelsV2} onChange={setLabelsV2} align="left" /></div>
        </PickerRow>

        <PickerRow label="StoryPointPicker">
          <div><StoryPointPicker value={sp} onChange={setSp} align="left" /></div>
          <div><StoryPointPickerV2 value={spV2} onChange={setSpV2} align="left" /></div>
        </PickerRow>

        <PickerRow label="BusinessValuePicker">
          <div><BusinessValuePicker value={bv} onChange={setBv} align="left" /></div>
          <div><BusinessValuePickerV2 value={bvV2} onChange={setBvV2} align="left" /></div>
        </PickerRow>

        <PickerRow label="SprintPicker">
          <div><SprintPicker value={sprint} sprints={MOCK_SPRINTS} onChange={setSprint} align="left" /></div>
          <div><SprintPickerV2 value={sprintV2} sprints={MOCK_SPRINTS} onChange={setSprintV2} align="left" /></div>
        </PickerRow>

        <PickerRow label="EpicPicker">
          <div><EpicPicker value={epic} onChange={setEpic} align="left" /></div>
          <div><EpicPickerV2 value={epicV2} onChange={setEpicV2} align="left" /></div>
        </PickerRow>

        <PickerRow label="VersionPicker">
          <div><VersionPicker options={MOCK_VERSIONS} selectedId={versionId} onSelect={setVersionId} align="left" /></div>
          <div><VersionPickerV2 options={MOCK_VERSIONS} selectedId={versionIdV2} onSelect={setVersionIdV2} align="left" /></div>
        </PickerRow>
      </div>
    </div>
  );
}
