# BRDG-266: Story writer must use the app's markdown/fence syntax, never Jira wiki markup

**Status:** Not Started
**Priority:** Medium
**Type:** Bugfix

## Description

As a PO, I want the story writer to produce story content in the syntax the app actually understands, so that the formatting I ask for renders as real blocks instead of literal markup I have to fix by hand.

Concrete trigger (VPL-46246): I asked the story writer to put a block of content in an expandable. It produced `{expand:Email to Shiji (Spruce)}` (old Jira wiki markup). That syntax is recognised nowhere in the app, so it survived as plain text. I had to manually rewrite it to `:::expand Email to Spruce`.

The expand case is one instance of a broader pattern: the AI falls back to Jira wiki markup for any block it does not have a fence/markdown convention for. So this story is about the **principle** - always use the app's markdown/fence syntax, never Jira wiki markup - not just the expand macro.

## Root cause

The whole Bridge pipeline uses one consistent convention and recognises **no** Jira wiki markup:

- Editor parse: `src/components/rich-editor/callout-markdown.ts`
- Editor serialize: `src/components/rich-editor/expand-extension.ts`, `callout-extension.ts`
- Markdown to ADF (push): `src/lib/markdown-to-adf.ts`
- ADF to markdown (read): `src/lib/adf-to-markdown.ts`

The convention:

| Element | App syntax |
|---|---|
| Expandable | `:::expand Title` ... `:::` |
| Callout panels | `:::info` / `:::warning` / `:::error` / `:::note` / `:::success` ... `:::` |
| Code block | ` ```lang ` fenced |
| Quote | `> text` |
| Headings | `#` ... `######` |
| Bold / italic | `**bold**` / `*italic*` |
| Links | `[text](url)` |
| Colored text | `{color:#hex}text{color}` (this one the app deliberately adopted; it is fine) |

Any Jira wiki block macro the AI emits instead is treated as ordinary text by every stage. Known siblings of the expand bug, all broken the same way:

- `{panel}`, `{info}`, `{note}`, `{warning}`, `{tip}` (callouts)
- `{code}`, `{noformat}` (code blocks)
- `{quote}` (blockquote)
- `h1.` / `h2.` wiki headings
- `*bold*` wiki bold (renders as *italic* in markdown)
- `[text|url]` wiki links
- `{status}`, `{anchor}`, `{toc}` and other macros

The AI emits these because the skill that generates drafts is never told the app's convention. The `write-story-draft` prompt (on VRW) documents a "Story format", "Writing guidelines", and one ADF gotcha ("Line break rule"), but nothing about block formatting. With no guidance the model uses the standard Jira wiki syntax it knows.

## Where the fix belongs

Not in the Bridge per-message prompt (`src/lib/story-writer-messages.ts`). Injecting formatting rules per request would repeat them in every prompt and every future Jira-content skill. This is a stable output convention, so it belongs with the skill that produces the content, next to the existing "Line break rule" which is the same class of ADF gotcha.

Two VRW skills produce Jira-bound story markdown and both need it:
- `.claude/skills/write-story-draft.md`
- `.claude/skills/jira-story-writer.md`

(VRW location: `/Users/thijsvandenberg/valk-workspace/tools/valk-remote-workspace`.)

## Proposed approach

Primary fix in VRW; an optional defensive net in Bridge.

1. **VRW skill convention (primary).** Add a short "Formatting" rule to the writing guidelines of both skills (next to the "Line break rule"): write all content in the app's markdown/fence syntax, and **never use Jira wiki markup**. Give the mapping table above as the reference, and call out the most likely traps explicitly: expandables (`:::expand`), callouts (`:::info` etc.), code fences over `{code}`, `#` headings over `h1.`, `**bold**` over `*bold*`, and `[text](url)` over `[text|url]`. If the same wording is later needed beyond these two skills, lift it into VRW `CLAUDE.md`; two skills is few enough to keep it local and explicit for now.

2. **Bridge defensive normalization (secondary, optional).** As a safety net against model drift or pasted Jira-wiki content, normalise the most common wiki block macros to fence syntax at a single choke point before the draft is parsed/rendered: `sanitizeDraft()` in `src/lib/story-draft-parser.ts` (from BRDG-262) or `src/lib/normalize-markdown.ts`. Start with `{expand:Title}` ... `{expand}` to `:::expand Title` ... `:::` and the `{panel}`/`{info}`/`{note}`/`{warning}`/`{tip}` callouts to `:::type`. Do not attempt a full Jira-wiki parser; cover the block macros most likely to appear and leave a clear place to add more.

## Out of scope

- A general Jira wiki markup parser.
- Markdown elements the converter cannot push correctly even in correct markdown (task-list checkboxes, images, @mentions, nested expand) - these are converter gaps, not a wiki-vs-fence syntax problem. Track separately.
- Content silently dropped when reading ADF from Jira (dates, status lozenges, layout columns) - tracked in BRDG-267.
- Injecting formatting conventions into the Bridge per-message prompt - explicitly rejected; see "Where the fix belongs".

## Checklist

- [ ] Reproduce: asking for an expandable (and for a panel/code block) yields literal wiki markup rather than a rendered block
- [ ] Add the markdown/fence formatting rule (with the mapping table + explicit traps) to `write-story-draft.md` and `jira-story-writer.md` on VRW
- [ ] (Optional) Normalise `{expand}` and `{panel}/{info}/{note}/{warning}/{tip}` to fence syntax at a single Bridge choke point
- [ ] Verify: requesting an expandable, a callout, and a code block all yield rendered blocks that convert to the right Jira nodes on push
- [ ] Tests (if defensive normalization is added): converts the covered macros and leaves normal markdown/code untouched
- [ ] All tests pass, build succeeds (Bridge side, if touched)

## Note

Cross-repo story: the primary change is in VRW, with an optional Bridge-side safety net. The record lives in Bridge because that is where the bug surfaced; track the VRW skill edits against this same BRDG number.
