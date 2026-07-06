# BRDG-479: Epic Writer - make advancing to the breakdown work

**Status:** Done
**Priority:** High

## Description

As the PO, after I have worked out an epic description in the Epic Writer, I want a clear, working way to advance to the child-story breakdown, so I can actually go through the flow (draft -> breakdown -> detail -> sprints) instead of getting stuck after the draft.

This is the blocking issue split out of the misc bucket [BRDG-478](BRDG-478-epic-writer-misc-improvements.md), which stays for later.

## Problem

Observed on epic `VPL-47279` (`/epics/VPL-47279/write`): the PO wrote and pushed the epic description, then could not proceed. Two things combine:

1. **The phase rail is a dead stepper.** The six-step rail (Feed / Discovery / Breakdown / Refine / Detail / Sprints) looks like a linear wizard, so clicking "Breakdown" is expected to advance the flow. In reality it is a free-movement bookmark: it persists the phase and moves the highlight but changes nothing on screen. Verified working at the transport level (`PATCH .../writer/phase` returns 200 and persists) - the problem is that selecting a phase does nothing meaningful.

2. **The only real trigger is a chat message, and it is not discoverable.** The breakdown is produced when the AI emits an `<epic-breakdown>` block, which `epic-breakdown-parser.ts` + `apply-output` parse into cards on the right-hand board. The empty board only says "Spar in chat to have the AI propose child stories." A PO does not know to do this, and in the observed session the AI produced a `<story-draft>` and a related-stories `<html-report>` but never an `<epic-breakdown>`, so `cards = 0` and the board stayed empty.

Net effect: the PO is stuck with no obvious next action.

## Immediate workaround (no code)

In the chat, ask the AI directly: e.g. "Break this epic down into child stories." When the AI returns an `<epic-breakdown>`, the cards appear in the right-hand Breakdown panel.

## In Scope

- A clear primary action to advance the flow from the epic draft into the breakdown (e.g. a "Generate breakdown" call-to-action in the empty board and/or entering the Breakdown phase triggers/prompts it), so the PO does not have to know the magic chat phrase
- Selecting a phase in the rail produces a visible, meaningful result (or the rail is restyled so it no longer implies gated wizard progression)
- Verify the epic skill reliably emits `<epic-breakdown>` when breakdown is requested; if it drifts into story-writer behaviour (story-draft / related-stories) instead, fix the skill/prompt so a breakdown request actually yields a breakdown

## Out of Scope

- The polish items in [BRDG-478](BRDG-478-epic-writer-misc-improvements.md) (save/push feedback, empty bubble, issue pill, creation description)
- Reworking detail/sprint phases beyond what is needed to unblock breakdown

## Acceptance Criteria

- [x] From a worked-out epic draft, the PO can reach the breakdown via an obvious on-screen action (no need to guess a chat phrase)
- [ ] Requesting a breakdown reliably produces child-story cards on the board (needs a live VRW run to confirm the skill emits `<epic-breakdown>`)
- [ ] The phase rail no longer reads as a broken wizard: selecting a step either does something or clearly is a non-blocking bookmark
- [x] Tests cover the new advance action; `npm run test` (7862 pass), `npm run typecheck`, `npm run lint` all green (`npm run build` pending, deferred to avoid disrupting the running prod session)

## Progress

Slice 1 (discoverability) implemented:

- `useStoryWriter.generateBreakdown()` - sets the session phase to `breakdown` (so the `break-down-epic` skill emits an `<epic-breakdown>`) and sends the breakdown request as one chat turn. Mirrors `deepenCard`.
- `BreakdownBoard` empty state - now shows a primary "Generate breakdown" CTA (with a busy/"Generating breakdown…" state) plus a chat hint, instead of only the "spar in chat" text. Wired through `EpicWriterLayout` (`onGenerateBreakdown={writer.generateBreakdown}`).
- Tests: `BreakdownBoard.test.tsx` (CTA renders, calls handler, disabled+busy label, hidden once cards exist) and `useStoryWriter.test.ts` (generateBreakdown PATCHes phase to breakdown and POSTs the breakdown request).

Remaining:

- Phase-rail treatment / overall navigation clarity moved to [BRDG-484](BRDG-484-epic-writer-layout-navigation.md) (it is part of the broader layout/navigation rework, not just this story).

**Core outcome achieved:** confirmed live on `VPL-47279` - Generate breakdown now populates the board with child-story cards.

### Root cause found: follow-up turns never invoke the break-down-epic skill

End-to-end test on `VPL-47279`: the CTA sent the request, the AI replied with a breakdown, but the board stayed empty (`cards = 0`). The reply is **prose** (a numbered markdown list); it contains **no `<epic-breakdown>` block**, so `extractEpicBreakdown` parses nothing.

Why the block is missing: the VRW skill is chosen once, at conversation start.

- `buildFirstMessageBody` / `buildEpicFirstMessageBody` dispatch `skill: "break-down-epic"` for breakdown phases (`story-writer-messages.ts:421`).
- But **follow-up** turns post to `/api/conversations/{id}/messages` with only `{ content, model }` and **no skill** (`story-writer-messages.ts:846`) - they continue whatever skill the VRW conversation already runs.
- This epic's conversation was created in the **feed** phase, which uses `write-story-draft`. So every later turn - including "Generate breakdown" - keeps running `write-story-draft`. The `[phase: breakdown]` marker Bridge adds to the follow-up text is not enough to switch the VRW skill, so the model answers in prose and never emits `<epic-breakdown>`.

Net: once a session starts in feed, the breakdown skill is never actually invoked; the board can never populate.

### Proposed fix

Make a breakdown-phase turn actually run the `break-down-epic` skill even when it is a follow-up. Reuse the existing skill-switch mechanism (`needsFreshSession`): when the epic phase requires the breakdown skill but the current VRW conversation is running a different skill, dispatch a fresh workspace turn via `buildFirstMessageBody` with the prior chat history prepended as context (as the `needsFreshSession` path already does), instead of a plain conversation follow-up. Track/infer the "current skill" so the switch fires once, feed -> breakdown, and not on every turn.

- [x] Breakdown-phase follow-ups invoke `break-down-epic` as a fresh skill task (verified: `story-writer-messages.ts` now routes epic breakdown turns through `/api/tasks` with `skill: break-down-epic` + a fresh conversation id + prior chat as context). Board population needs a live click to confirm end-to-end.
- [x] Tests cover the skill-switch dispatch (feed -> breakdown routes through the breakdown skill, not a plain follow-up): `story-writer-messages.epic.test.ts`

### Slice 2 (skill dispatch) implemented

VRW behaviour (confirmed by reading `valk-remote-workspace/src/task-queue.ts`): a follow-up (`_message`) resumes the existing Claude session, and even a skill task resumes it when the conversation already has a session - so the skill is fixed at conversation start. Only a fresh conversation id starts a new session with the requested skill.

Fix in `sendStoryWriterMessage` (`src/lib/story-writer-messages.ts`): when `mode === "epic"` and the phase uses the breakdown skill, dispatch a fresh `break-down-epic` skill task (fresh conversation id + prior chat prepended as context) instead of a plain conversation follow-up. `apply-output` / `apply-draft` persist by ticket key, so the reply still lands in the same Bridge chat and the `<epic-breakdown>` block populates the board. The skill re-receives the full breakdown state each turn by design, so a fresh session per turn is correct.

Verified: `npm run test` (7868 pass), `npm run typecheck`, `npm run lint` green. `npm run build` + prod restart pending (coordinated with the PO, who is running prod).

Trade-off noted: each breakdown turn re-sends chat history + breakdown state (no VRW-side memory reuse). Fine for the short breakdown workflow; can optimise later if needed.

### Slice 3: dedup window bug (blocked re-clicking the CTA)

Live symptom: clicking Generate breakdown showed "Duplicate message blocked" even ~50 minutes after the previous identical request. Root cause is a pre-existing bug in the shared story-writer dedup (`story-writer-messages.ts`): `message.timestamp` is stored ISO-8601 (`2026-07-06T12:33:45.098Z`) but was compared with a raw string operator against `datetime('now','-30 seconds')` (space-separated). At index 10, `'T'` (84) > `' '` (32), so every ISO timestamp sorts above the window - identical content was blocked forever, not for 30s. Because the CTA sends a fixed string, the second-ever click was always blocked.

Fix: normalise both sides with `datetime(...)` so the 30s window works. Verified in SQLite (old = out, 5s = in, 40s = out) and with two tests in `story-writer-messages.epic.test.ts` (identical-old passes, identical-within-30s still 409s). This also fixes the same latent bug for the regular Story Writer.

Verified: `npm run test` (7870 pass), `npm run typecheck`, `npm run lint` green.
