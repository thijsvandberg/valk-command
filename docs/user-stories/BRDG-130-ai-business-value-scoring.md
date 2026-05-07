# BRDG-130: AI-Assisted Business Value Scoring

**Status:** Open
**Priority:** Medium
**Depends on:** BRDG-129

## Description

As the PO, I want the remote agent (VRA) to suggest Business Value scores for tickets so I can quickly score an entire sprint or validate my existing scores for consistency. This builds on the manual BV scoring from BRDG-129.

## Acceptance Criteria

### Phase 1: Single ticket BV suggestion
- [ ] Add a "Suggest BV" action to the BV cell or ticket sidebar
- [ ] Sends ticket context (title, description, acceptance criteria, epic) to VRA
- [ ] VRA returns a suggested BV score (1-7) with a short rationale
- [ ] Score is shown as a suggestion, not auto-applied
- [ ] PO can accept (applies score), adjust, or dismiss

### Phase 2: Bulk BV scoring
- [ ] Multiselect tickets on the sprint board
- [ ] "Score BV" action available for the selection
- [ ] VRA processes all selected tickets in one request, considering relative value across the set
- [ ] Results shown in a review panel: ticket, current BV, suggested BV, rationale
- [ ] PO can accept/reject per ticket or accept all

### Phase 3: Sprint validation
- [ ] "Validate BV scores" action at sprint level
- [ ] VRA reviews all scored tickets in the sprint for consistency
- [ ] Flags outliers or inconsistencies (e.g. similar tickets with very different BV)
- [ ] Shows a summary with suggested adjustments and reasoning
- [ ] PO can accept individual adjustments or dismiss

## Technical Notes

- Uses existing VRA skill/proxy infrastructure for agent communication
- VRA needs ticket context: summary, description, acceptance criteria, epic, and existing BV scores of other tickets in the sprint for relative comparison
- Streaming response via SSE for progress feedback during bulk operations
- Suggested scores are ephemeral until accepted; no separate storage needed

## Out of Scope

- Auto-scoring without PO review (scores always require explicit acceptance)
- Historical BV trend analysis to inform suggestions
- Stakeholder input as signal for BV scoring
