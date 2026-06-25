import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BoardRow } from "./BoardRow";
import { ChildIssueRow } from "@/components/ticket-detail/ChildIssueRow";
import { rowSurfaceClasses, type RowSurfaceState } from "./row-surface";
import type { Ticket, Subtask } from "@/types/ticket";
import type { InlineTagId } from "./filter-bar-types";

// BRDG-390 drift guard: BoardRow and ChildIssueRow must render the SAME surface skin for the
// same logical state, because both feed it through rowSurfaceClasses(). If anyone hand-edits a
// surface class back into either row, the shared helper string stops being a substring of that
// row's className and this fails. (The helper output itself is pinned in row-surface.test.ts.)
//
// Only the states BOTH rows can express via props are crossed here; context-target / focus /
// removed are board-only (ChildIssueRow hardcodes them false) and live-pulse is covered by the
// helper pin. Both rows are kept light: empty `tags` stops BoardRow rendering its metadata, so
// only the status pill and the live-change hook need stubbing.

vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ ticketKey }: { ticketKey: string }) => <span>{ticketKey}</span>,
}));
vi.mock("@/hooks/useLiveTicketChange", () => ({ useLiveTicketChange: () => new Set() }));

const TICKET: Ticket = {
  key: "VPL-1",
  title: "Row",
  type: "story",
  epic: null,
  epicKey: null,
  jiraStatus: "TO DO",
  storyPoints: null,
  assignee: null,
  flagged: false,
  readiness: null,
  poStatus: null,
  qualityScore: null,
  businessValue: null,
  editState: "clean",
  notes: "",
};
const SUB: Subtask = { key: "VPL-1", title: "Row", type: "subtask", jiraStatus: "TO DO", assignee: null };

// The subset of RowSurfaceState that both rows can drive from props.
type CrossState = Pick<RowSurfaceState, "selected" | "checked" | "flagged" | "deprecated" | "inflight" | "firstInCard" | "lastInCard">;

const CASES: { name: string; state: CrossState }[] = [
  { name: "resting", state: { selected: false, checked: false, flagged: false, deprecated: false, inflight: false, firstInCard: false, lastInCard: false } },
  { name: "selected", state: { selected: true, checked: false, flagged: false, deprecated: false, inflight: false, firstInCard: false, lastInCard: false } },
  { name: "checked", state: { selected: false, checked: true, flagged: false, deprecated: false, inflight: false, firstInCard: false, lastInCard: false } },
  { name: "flagged", state: { selected: false, checked: false, flagged: true, deprecated: false, inflight: false, firstInCard: false, lastInCard: false } },
  { name: "deprecated", state: { selected: false, checked: false, flagged: false, deprecated: true, inflight: false, firstInCard: false, lastInCard: false } },
  { name: "inflight/pending", state: { selected: false, checked: false, flagged: false, deprecated: false, inflight: true, firstInCard: false, lastInCard: false } },
  { name: "first+last in card", state: { selected: false, checked: false, flagged: false, deprecated: false, inflight: false, firstInCard: true, lastInCard: true } },
];

function expectedSurface(c: CrossState): string {
  return rowSurfaceClasses({ ...c, contextTarget: false, focused: false, removed: false, hideAccent: false, livePulse: false });
}

function boardSurface(c: CrossState): HTMLElement {
  const { container } = render(
    <table>
      <tbody>
        <BoardRow
          ticket={{ ...TICKET, flagged: c.flagged, jiraStatus: c.deprecated ? "DEPRECATED" : "TO DO" }}
          ticketIdx={0}
          isChecked={c.checked}
          isSelected={c.selected}
          someChecked={false}
          isDragActive={false}
          isInflight={c.inflight}
          isFirstInCard={c.firstInCard}
          isLastInCard={c.lastInCard}
          tags={new Set<InlineTagId>()}
          selectedTicket={null}
          onSelectTicket={() => {}}
          onCheckboxClick={() => {}}
        />
      </tbody>
    </table>,
  );
  return container.querySelector("td > div") as HTMLElement;
}

function childSurface(c: CrossState): HTMLElement {
  const { container } = render(
    <ChildIssueRow
      item={{ ...SUB, jiraStatus: c.deprecated ? "DEPRECATED" : "TO DO" }}
      isLast={false}
      isActive={c.selected}
      isChecked={c.checked}
      flagged={c.flagged}
      isPending={c.inflight}
      roundTop={c.firstInCard}
      roundBottom={c.lastInCard}
    />,
  );
  return container.firstChild as HTMLElement;
}

describe("row-surface drift guard (BRDG-390)", () => {
  for (const { name, state } of CASES) {
    it(`BoardRow and ChildIssueRow share the surface for: ${name}`, () => {
      const expected = expectedSurface(state);
      expect(boardSurface(state).className).toContain(expected);
      expect(childSurface(state).className).toContain(expected);
    });
  }
});
