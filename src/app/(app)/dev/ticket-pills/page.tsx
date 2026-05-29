"use client";

// Temporary dev showcase for the ticket pill / status badge components.
// Lists every variant in isolation and in realistic contexts so the PO can
// review them in one place. Safe to delete — not linked from navigation.

import { useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Component } from "lucide-react";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import type { JiraStatus, TicketReadiness, IssueType } from "@/types/ticket";
import { READINESS_CONFIG } from "@/types/ticket";

const JIRA_STATUSES: JiraStatus[] = ["TO DO", "IN PROGRESS", "TEST", "DONE", "DEPRECATED"];
const ISSUE_TYPES: IssueType[] = ["story", "bug", "task", "subtask", "spike", "epic"];
const READINESS: (TicketReadiness | null)[] = [null, "drafting", "waiting_for_feedback", "ready_to_refine", "on_hold"];

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">{title}</h2>
      {description && <p className="mt-1 mb-4 max-w-2xl text-body-sm text-text-tertiary leading-relaxed">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </section>
  );
}

function Specimen({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-default bg-[var(--color-surface-elevated)] p-4">
      <span className="font-mono text-[10px] uppercase tracking-wide text-text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TicketPillsDevPage() {
  const pageTitle = usePageTitle("Dev · Ticket Pills");

  // Editable demo state so interactive variants actually work.
  const [status, setStatus] = useState<JiraStatus>("IN PROGRESS");
  const [readiness, setReadiness] = useState<TicketReadiness | null>("drafting");
  const [type, setType] = useState<IssueType>("story");

  // Per-row state for the sprint-board-style table demo.
  const [rows, setRows] = useState(
    [
      { key: "VPL-45728", type: "story" as IssueType, status: "IN PROGRESS" as JiraStatus, readiness: "drafting" as TicketReadiness | null, title: "Adopt outside-click cleanup" },
      { key: "VPL-45802", type: "bug" as IssueType, status: "IN PROGRESS" as JiraStatus, readiness: null as TicketReadiness | null, title: "Activity Log crash on wrapped response" },
      { key: "VPL-45803", type: "task" as IssueType, status: "DONE" as JiraStatus, readiness: "ready_to_refine" as TicketReadiness | null, title: "Archive completed stories" },
      { key: "VPL-45810", type: "spike" as IssueType, status: "TEST" as JiraStatus, readiness: "waiting_for_feedback" as TicketReadiness | null, title: "Investigate sync watermark drift" },
    ],
  );
  function patchRow(i: number, patch: Partial<(typeof rows)[number]>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <>
      {pageTitle}
      <ViewHeader icon={<Component size={16} strokeWidth={1.5} />}>
        <ViewHeaderTitle>Dev · Ticket Pills</ViewHeaderTitle>
      </ViewHeader>

      <div className="mx-auto max-w-5xl px-8 py-8">
        <p className="mb-8 max-w-2xl text-body-sm text-text-tertiary leading-relaxed">
          Temporary showcase of <code className="font-mono text-text-secondary">TicketStatusPill</code> and the lighter{" "}
          <code className="font-mono text-text-secondary">StatusBadge</code> component. Every variant is shown in
          isolation and, where relevant, inside a realistic context. Pills with change handlers are interactive — click
          a segment to open its dropdown.
        </p>

        {/* ----------------------------------------------------------------- */}
        {/* Default variant                                                   */}
        {/* ----------------------------------------------------------------- */}
        <Section
          title="TicketStatusPill — default variant"
          description="The unified pill container with segment dividers. This is the form in your first screenshot. Used in card headers, ticket detail sidebar, story writer."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Specimen label="read-only (key + status)">
              <TicketStatusPill ticketKey="VPL-45728" jiraStatus="IN PROGRESS" issueType="story" />
            </Specimen>
            <Specimen label="fully interactive (click any segment)">
              <TicketStatusPill
                ticketKey="VPL-45728"
                jiraStatus={status}
                readiness={readiness}
                issueType={type}
                title="Demo ticket title"
                onJiraStatusChange={setStatus}
                onReadinessChange={setReadiness}
                onIssueTypeChange={setType}
              />
            </Specimen>

            <Specimen label='size="sm"'>
              <TicketStatusPill ticketKey="VPL-45728" jiraStatus="IN PROGRESS" issueType="story" size="sm" />
            </Specimen>
            <Specimen label='size="md" (default)'>
              <TicketStatusPill ticketKey="VPL-45728" jiraStatus="IN PROGRESS" issueType="story" size="md" />
            </Specimen>
            <Specimen label='size="lg"'>
              <TicketStatusPill ticketKey="VPL-45728" jiraStatus="IN PROGRESS" issueType="story" size="lg" />
            </Specimen>

            <Specimen label="showStatus={false} (key only)">
              <TicketStatusPill ticketKey="VPL-45728" jiraStatus="IN PROGRESS" issueType="story" showStatus={false} />
            </Specimen>
            <Specimen label="showKey={false} (status only)">
              <TicketStatusPill ticketKey="VPL-45728" jiraStatus="IN PROGRESS" issueType="story" showKey={false} />
            </Specimen>
            <Specimen label="removedFromJira (DELETED)">
              <TicketStatusPill ticketKey="VPL-45728" jiraStatus="IN PROGRESS" issueType="story" removedFromJira />
            </Specimen>
            <Specimen label="with readiness segment">
              <TicketStatusPill ticketKey="VPL-45728" jiraStatus="IN PROGRESS" issueType="story" readiness="ready_to_refine" />
            </Specimen>
          </div>
        </Section>

        {/* ----------------------------------------------------------------- */}
        {/* All Jira statuses                                                 */}
        {/* ----------------------------------------------------------------- */}
        <Section title="All Jira statuses" description="Status pill colors and abbreviations as defined in JIRA_STATUS_COLORS / JIRA_STATUS_ABBREVIATIONS.">
          <Specimen label="JiraStatus values">
            {JIRA_STATUSES.map((s) => (
              <TicketStatusPill key={s} ticketKey="VPL-00000" jiraStatus={s} issueType="story" />
            ))}
          </Specimen>
        </Section>

        {/* ----------------------------------------------------------------- */}
        {/* All issue types                                                   */}
        {/* ----------------------------------------------------------------- */}
        <Section title="All issue types" description="The leading icon segment. Story = bookmark, the icon in your screenshots.">
          <Specimen label="IssueType values">
            {ISSUE_TYPES.map((t) => (
              <TicketStatusPill key={t} ticketKey="VPL-00000" jiraStatus="IN PROGRESS" issueType={t} />
            ))}
          </Specimen>
          <div className="mt-3">
            <Specimen label="bare IssueTypeIcon">
              {ISSUE_TYPES.map((t) => (
                <span key={t} className="flex items-center gap-1.5 text-body-sm text-text-tertiary">
                  <IssueTypeIcon type={t} size={16} /> {t}
                </span>
              ))}
            </Specimen>
          </div>
        </Section>

        {/* ----------------------------------------------------------------- */}
        {/* All readiness states                                              */}
        {/* ----------------------------------------------------------------- */}
        <Section title="All readiness states" description="The trailing PO-readiness segment. null renders the neutral 'Ready for Development' dot.">
          <Specimen label="TicketReadiness values">
            {READINESS.map((r) => (
              <div key={r ?? "ready"} className="flex flex-col items-center gap-1">
                <TicketStatusPill ticketKey="VPL-00000" jiraStatus="IN PROGRESS" issueType="story" readiness={r} />
                <span className="text-[10px] text-text-muted">{r ? READINESS_CONFIG[r].label : "Ready for Dev"}</span>
              </div>
            ))}
          </Specimen>
        </Section>

        {/* ----------------------------------------------------------------- */}
        {/* List variant                                                      */}
        {/* ----------------------------------------------------------------- */}
        <Section
          title='TicketStatusPill — variant="list"'
          description="No outer container; segments float inline. This is the form in your second screenshot, used in dense table rows. Dropdowns render via a portal to escape the table's overflow."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Specimen label='variant="list"'>
              <TicketStatusPill variant="list" ticketKey="VPL-45802" jiraStatus="IN PROGRESS" issueType="story" />
            </Specimen>
            <Specimen label='variant="list" compact'>
              <TicketStatusPill variant="list" compact ticketKey="VPL-45803" jiraStatus="DONE" issueType="task" />
            </Specimen>
          </div>
        </Section>

        {/* ----------------------------------------------------------------- */}
        {/* In context: sprint board table                                    */}
        {/* ----------------------------------------------------------------- */}
        <Section
          title="In context — sprint board table"
          description="List variant inside a table row, fully interactive. Click the type icon, key, status, or readiness on any row."
        >
          <div className="overflow-hidden rounded-xl border border-border-default bg-[var(--color-surface-elevated)]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-default text-left">
                  <th className="px-4 py-2.5 text-label font-medium uppercase tracking-wide text-text-muted">Ticket</th>
                  <th className="px-4 py-2.5 text-label font-medium uppercase tracking-wide text-text-muted">Summary</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key} className="border-b border-border-subtle last:border-0 hover:bg-[var(--color-surface-elevated-hover)]">
                    <td className="px-4 py-2.5 align-middle">
                      <TicketStatusPill
                        variant="list"
                        ticketKey={r.key}
                        issueType={r.type}
                        jiraStatus={r.status}
                        readiness={r.readiness}
                        title={r.title}
                        onJiraStatusChange={(s) => patchRow(i, { status: s })}
                        onReadinessChange={(rd) => patchRow(i, { readiness: rd })}
                        onIssueTypeChange={(t) => patchRow(i, { type: t })}
                      />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-body-sm text-text-secondary">{r.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ----------------------------------------------------------------- */}
        {/* In context: card header + sidebar                                 */}
        {/* ----------------------------------------------------------------- */}
        <Section title="In context — card header & detail sidebar" description="Default variant inside a card header and a ticket-detail sidebar block.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Card */}
            <div className="rounded-xl border border-border-default bg-[var(--color-surface-elevated)] p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <TicketStatusPill ticketKey="VPL-45728" jiraStatus="IN PROGRESS" issueType="story" readiness="drafting" />
              </div>
              <h3 className="text-heading-sm font-semibold text-text-primary">Adopt outside-click cleanup, remove dead code</h3>
              <p className="mt-1.5 text-body-sm text-text-tertiary leading-relaxed">
                Replace ad-hoc document listeners with the shared useOutsideClick hook and delete the now-unused
                helpers.
              </p>
            </div>

            {/* Sidebar */}
            <div className="rounded-xl border border-border-default bg-[var(--color-surface-elevated)] p-5">
              <span className="text-label font-medium uppercase tracking-wide text-text-muted">Ticket</span>
              <div className="mt-2 flex flex-col gap-3">
                <TicketStatusPill
                  size="lg"
                  ticketKey="VPL-45728"
                  jiraStatus={status}
                  readiness={readiness}
                  issueType={type}
                  title="Adopt outside-click cleanup"
                  onJiraStatusChange={setStatus}
                  onReadinessChange={setReadiness}
                  onIssueTypeChange={setType}
                />
                <span className="text-body-sm text-text-tertiary">Interactive — shares state with the demo above.</span>
              </div>
            </div>
          </div>
        </Section>

        {/* ----------------------------------------------------------------- */}
        {/* StatusBadge                                                       */}
        {/* ----------------------------------------------------------------- */}
        <Section title="StatusBadge" description="Standalone status badge — full status label, no key or icon. Renders the unabbreviated Jira status.">
          <Specimen label="all JiraStatus values">
            {JIRA_STATUSES.map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </Specimen>
        </Section>
      </div>
    </>
  );
}
