# BRDG-124: Story Writer Template System

**Status:** Open
**Priority:** Low

## Description

The story writer starts with a blank canvas or the existing Jira description. The rich editor has slash commands for inserting basic templates (`src/components/rich-editor/slash-commands/slash-command-templates.ts` defines `AC_TEMPLATE_HTML`, `STORY_TEMPLATE_HTML`, `BUG_TEMPLATE_HTML`, `TASK_TEMPLATE_HTML`), but these are fixed and cannot be customized. Teams have their own conventions for story structure.

This story extends BRDG-033 (Per-type Draft Skills, open) which focuses on AI behavior per type. This story focuses on user-customizable content templates.

### Proposed features

**Pre-built templates per issue type:**
- Story, Bug, Task, Spike templates with team-convention structure
- Each includes sensible default sections for the issue type

**User-created custom templates:**
- Stored in the `appSetting` table as JSON, similar to how quick-prompts are stored (see `src/app/api/settings/quick-prompts/route.ts`)
- Max 20 custom templates per user

**Template variables:**
- `{{ticket_key}}` - current ticket key
- `{{assignee}}` - ticket assignee
- `{{sprint}}` - current sprint name
- `{{epic}}` - parent epic name
- Variables are auto-filled when template is applied

**Template access points:**
- Story writer session start (launcher modal) via a template picker
- Rich editor slash commands (`/template`)
- Quick prompts settings page (extend existing)

**Template management:**
- Create, edit, and delete custom templates
- Management UI in settings (extend quick-prompts page or add dedicated section)

### Related stories

- BRDG-033 (Per-type Draft Skills, open) - AI behavior per type
- BRDG-052 (Rich Editor Slash Commands, done) - slash command infrastructure already exists

## Acceptance Criteria

- [ ] Built-in templates for Story, Bug, Task, Spike issue types
- [ ] User can create, edit, and delete custom templates
- [ ] Templates support variables (ticket key, assignee, sprint, epic)
- [ ] Template picker in story writer launcher modal
- [ ] Templates accessible via /template slash command in rich editor
- [ ] Template management UI in settings (extend quick-prompts page or add dedicated section)
- [ ] Max 20 custom templates per user

## Impact

Gives the team reusable, customizable starting points for every issue type instead of relying on fixed slash-command templates or blank canvases. Reduces repetitive setup work and helps enforce consistent story structure across the backlog.
