# BRDG-352: Backslashes before an escaped image grow on the Jira push round-trip

**Status:** Not Started
**Priority:** Medium
**Type:** Bugfix

## Description

As a PO, I want a description containing a backslash-escaped image reference to survive a push to Jira and back without accumulating extra backslashes, so untouched content is not silently mutated each cycle.

On the "CLI/Bridge test story (don't delete)" (VPL-1337), a line like
`\![image-20260404-222028.png](/api/attachments/att-235476)` shows its backslashes
**doubling** in the diff after a push (`\\` -> `\\\\`), without the PO editing that
line. This is the leftover part of the round-trip corruption reported alongside the
expand-title duplication (fixed) and the post-push title flicker (fixed).

## What is already ruled out (investigated)

- **Local lib round-trip is byte-stable.** `adfToMarkdown(markdownToAdf(x))` leaves the escaped-image line unchanged across many cycles (verified).
- **Local editor round-trip is idempotent, not cumulative.** The TipTap `RichEditor` load->serialize turns `\\![…]` into `\` + blank lines on the *first* pass, then stabilises (c2 = c3 = c4). It does **not** reproduce the observed `\\` -> `\\\\` doubling.

So the doubling does not originate in `markdown-to-adf.ts`, `adf-to-markdown.ts`, or the TipTap serialization that the other fixes touched. The remaining suspect is the **Jira server round-trip**: `markdownToAdf` emits the literal `\` and `![…]` as separate text nodes; Jira may escape/normalise backslashes in its stored ADF text nodes, so the value read back (and re-pushed) gains backslashes each cycle.

## How to investigate

- Push a minimal description (`\![x.png](/api/attachments/att-1)`) from Bridge to a scratch Jira ticket, then read the raw ADF back from Jira (not via Bridge) and inspect the text node(s). Confirm whether Jira added the backslash. **Requires an explicit go-ahead to push to Jira.**
- If Jira is the source: normalise the escaped-image representation on the write side so it round-trips through Jira cleanly (e.g. don't emit a bare leading `\`; or represent the image without the escape), or unescape on read.
- If a local path is still involved: extend the editor round-trip test (`src/components/rich-editor/markdown-roundtrip.test.tsx`) with the failing case and fix the serializer.

## Out of scope

- Expand title duplication - fixed (commit `8bc56dcf`).
- Post-push title not updating - fixed (commit `137c37a3`).
- Real image attachment upload (BRDG-268 out-of-scope note).

## Notes

- The construct only appears because the test story deliberately contains backslash runs; normal descriptions are unaffected. Priority is Medium because it is real cumulative mutation but on pathological content.
- The comparison layer (`normalizeMarkdownForCompare`, BRDG-348) deliberately does NOT fold backslash-run differences, precisely so this real corruption stays visible rather than hidden.

## Checklist

- [ ] Reproduce against a real Jira push and capture the raw ADF Jira stores/returns
- [ ] Pin whether the doubling is added by Jira or a local path
- [ ] Fix so `\![x](url)` round-trips through a Jira push without gaining backslashes
- [ ] Regression test (editor round-trip and/or a documented Jira-contract test)
- [ ] All tests pass, build succeeds
