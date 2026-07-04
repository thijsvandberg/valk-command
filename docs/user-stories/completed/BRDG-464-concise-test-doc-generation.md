# BRDG-464: Make generated test docs more concise (skill calibration round 2)

**Status:** Done
**Priority:** Medium
**Type:** Chore

## Description

Generated stakeholder test docs are still slightly too verbose. The VPL-45607 doc is the
reference case: it quoted the full email subject and body copy verbatim (including "yellow
warning triangle" and the "Let op" heading), carried implementation rationale in the title
("… instead of DLQ noise"), and packed a multi-sentence explanation into a single bullet's
"Note:". Stakeholders are domain-aware testers; a short paraphrase with a pointer to the
story is enough. This story tightens the `generate-test-doc` skill prompt so future docs
come out leaner, without losing checks.

This is the second calibration round; the first (VPL-46241, see BRDG-426 post-ship
enhancement 3) added the right-sizing and translation-string rules. The current output
follows the prompt as written — the prompt's own rules permit the verbosity — so this is
a rules change, not a model-drift fix.

## Current Behaviour

- The doc is produced by the VRW skill prompt at
  `/Users/thijsvandenberg/valk-workspace/tools/valk-remote-workspace/.claude/skills/generate-test-doc.md`
  (registered in VRW `src/skills.ts` `SKILL_REGISTRY`). The prompt file is read with
  `readFileSync` at invocation time, so edits apply to the next generation without a VRW
  rebuild or restart.
- Bridge dispatches it from `src/app/api/tickets/[key]/generate-test-doc/route.ts` with
  ticket title/type/description, all comments, and recent status changes. There is no
  Bridge-side prompt override (Settings > Prompts does not touch this skill).
- Three prompt rules cause the observed verbosity:
  1. Verbatim quoting is allowed for "a new or changed error/UI message" — a new hotel
     email qualifies, so full subject + body copy gets reproduced.
  2. The "no rationale" rule applies to checks only, not to the block title — hence
     "… instead of DLQ noise".
  3. Side-notes inside a bullet have no length constraint — the Loyal edge case became a
     three-sentence "Note:".

## Proposed Approach

Edit the skill prompt only. Four changes:

1. **Flip the quoting rule for emails/notifications.** Never reproduce subject lines or
   body copy of emails/notifications; identify a mail by a short paraphrase plus a pointer,
   e.g. "the hotel receives the new warning email about a payment on a cancelled
   reservation (exact wording in the story)". Verbatim quoting remains only when the check
   IS the wording change (a corrected label or error text): one short string, one language.
2. **Extend the no-rationale rule to the title.** The title names the behaviour, never the
   reason or the internal problem it solves.
3. **One sentence per bullet.** Side conditions become a short clause ("only possible
   without Loyal"), never a "Note:" with explanation. "Internal:" lines use a fixed terse
   pattern ("Internal: X — dev team verifies").
4. **Add a bad→good contrastive example** based on the VPL-45607 quoted-email bullet
   (verbose original vs. one-line paraphrase), next to the existing right-sizing example.

Out of scope:

- No Bridge code changes (routes, parser, review modal all untouched).
- No regeneration of already-saved docs; only future generations are affected.
- No changes to classification behaviour (`ok` / `needs_input` / `not_stakeholder_relevant`).

## Implementation Plan

1. Apply the four edits to
   `valk-remote-workspace/.claude/skills/generate-test-doc.md`; commit in the VRW repo.
2. Validate: regenerate the doc for VPL-45607 plus one small fix and one normal story from
   a recent sprint; compare old vs. new side by side with the PO (tighter, no lost checks).

### Validation results (2026-07-04)

Regenerated via the real flow (POST `/api/tickets/[key]/generate-test-doc`, prompt v1.1.0):

- **VPL-45607** (reference case, normal story): 4 verbose bullets with full email copy →
  3 one-sentence bullets; email referenced by paraphrase + "(exact wording in the story)";
  title lost the "instead of DLQ noise" rationale; Loyal note became a clause; Internal
  line follows the terse pattern. No checks lost (reinstatement merged into bullet 1).
- **VPL-47093** (small fix): output effectively unchanged — was already concise, so the
  new rules do not over-trim.
- **VPL-46432** (story): output effectively unchanged apart from minor wording.

Side effect: the three regenerations wrote `test_doc_draft` (accepted `test_doc`
untouched), so the new versions sit in the review modal behind the provenance banner,
ready to accept.

## Acceptance Criteria

- [x] The prompt forbids reproducing email/notification subject or body copy; mails are
      referenced by paraphrase with an "exact wording in the story" pointer. <!-- generate-test-doc.md, quoting rule under "Writing the block" -->
- [x] Verbatim quoting is limited to checks where the wording itself is the change: one
      short string, one language. <!-- generate-test-doc.md, same rule -->
- [x] The no-rationale rule explicitly covers the block title. <!-- generate-test-doc.md, title paragraph ("names the behaviour only") + rules list -->
- [x] Bullets are capped at one sentence; side conditions are short clauses; "Internal:"
      lines follow the terse fixed pattern. <!-- generate-test-doc.md, rules list -->
- [x] The prompt contains a bad→good example derived from the VPL-45607 quoted-email
      bullet. <!-- generate-test-doc.md, "Too detailed / Right" example after the right-sizing example -->
- [x] Regenerated docs for VPL-45607 + one small + one normal story are visibly more
      concise without dropping checks, confirmed by the PO. <!-- manual comparison via TestDocReviewModal regenerate; PO confirmed 2026-07-04 -->

## Tests

- [x] Manual validation only: this story changes a prompt `.md` in the VRW repo; there is
      no Bridge code to unit-test. The comparison run in the implementation plan is the
      acceptance test. <!-- see Validation results (2026-07-04) above -->

## Related

- [[BRDG-426-generate-test-doc]] — introduced the skill and the first calibration round
  (post-ship enhancement 3); this story is calibration round 2.
- [[BRDG-461-sprint-test-doc-delivery]] — consumes the docs in the sprint bundle; leaner
  docs shrink the bundle too.
- Reference case: VPL-45607 generated doc (quoted email copy, rationale in title, long
  side-notes).
