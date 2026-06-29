import type { Ticket } from "@/types/ticket";
import type { TicketPillHoverData } from "@/components/shared/TicketStatusPill";

// Maps a full board ticket to the hover-card shape. The card is editable by
// default (BRDG-276), so sprintId is carried through for the Sprint picker, and
// the PO signals (readiness, quality, notes, edit state) are included so the
// reference cards report the full set. sprintNames resolves the raw sprint id to
// its display name (e.g. "BT: 137").
//
// Server-safe (no React, no "use client"): the hover endpoint
// (GET /api/tickets/hover, BRDG-412) builds the same shape from DB rows, so this
// lives in lib/ rather than the hooks file. The hooks file re-exports it for the
// existing client importers.
export function buildTicketHoverData(t: Ticket, sprintNames: Record<string, string> = {}): TicketPillHoverData {
  return {
    title: t.title,
    type: t.type,
    jiraStatus: t.jiraStatus,
    storyPoints: t.storyPoints,
    businessValue: t.businessValue,
    sprintId: t.sprintId ?? null,
    sprintName: t.sprintId ? (sprintNames[t.sprintId] ?? t.sprintId) : null,
    epicKey: t.epicKey,
    epic: t.epic,
    assignee: t.assignee ?? null,
    reporter: t.reporter ?? null,
    openSubtaskCount: t.openSubtaskCount ?? 0,
    totalSubtaskCount: t.totalSubtaskCount ?? 0,
    flagged: t.flagged,
    readiness: t.readiness,
    qualityScore: t.qualityScore,
    notes: t.notes || null,
    editState: t.editState && t.editState !== "clean" ? t.editState : null,
  };
}
