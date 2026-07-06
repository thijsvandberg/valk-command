# BRDG-477: Rich Jira comment compose field

**Status:** Backlog
**Priority:** Medium

## Description

As the PO, I want to write Jira comments with basic formatting (bold, italic, inline code, code block, headings) so the comments land in Jira correctly formatted and the compose field grows with the content instead of staying a fixed two-line box.

## Problem

The "Post a comment to Jira" field in `CommentsSection.tsx` (`JiraCommentsSection`) is a fixed `rows={2}` plain textarea with `resize-none`. It does not auto-grow and offers no formatting controls. Since Jira renders wiki markup / ADF in comments, there is no way to write structured comments from Bridge today.

The PO comment field above it has the same sizing problem.

## In Scope

- Jira comment compose field auto-grows as the user types (min ~3 rows, no hard cap)
- Formatting toolbar above the compose area with: **Bold**, _Italic_, `Inline code`, ` ``` Code block`, and Heading (h3 or h4)
- Toolbar applies Jira wiki markup syntax (e.g. `*bold*`, `_italic_`, `{{code}}`, `{code}...{code}`, `h3.`)
- Selected text gets wrapped; no selection inserts the marker at cursor
- PO comment field also gets auto-grow (toolbar is optional / lower priority for PO comments since those stay in Bridge only)
- Toolbar is visible only when the field is focused or has content

## Out of Scope

- Full WYSIWYG editor (stay in plain-text with markup, not a rich-text render)
- Preview pane showing rendered output
- Mentions (`@user`)
- Image upload

## Acceptance Criteria

- [ ] Jira comment compose field grows vertically as text is added, starting at ~3 rows
- [ ] Toolbar appears on focus; each action inserts correct Jira wiki markup
- [ ] Wraps selected text; inserts marker at cursor when nothing is selected
- [ ] Submitted comment content is identical to what would be typed manually
- [ ] PO comment field also auto-grows
- [ ] All existing tests pass; new tests cover toolbar markup insertion logic
