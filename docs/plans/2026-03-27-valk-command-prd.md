# PRD: valk-command

**Date:** 2026-03-27
**Author:** Thijs van den Berg
**Status:** Draft

## Problem

The Product Owner for Valk Platform manages stories, refinements, tests, and sprint oversight across Jira, Claude Code CLI, Slack, email, and browser-based tools. There is no single interface that ties these together. Context switching between tools costs time and breaks flow. Sprint oversight requires manually running skills and piecing together results.

## Vision

A single web application that serves as the PO's command center. Chat-driven interaction with the Claude workspace for story work and investigations. A sprint board with a PO metadata layer on top of Jira. Real-time visibility into what the workspace is doing. Test management and scheduled job control.

## User

Thijs van den Berg, Product Owner for Valk Platform. Solo user (no multi-tenancy needed for MVP). Accesses the tool from desktop browser during work hours.

## Core Concepts

| Concept | Description |
|---------|-------------|
| **valk-agent** | The remote Claude Code environment that executes skills (story writing, investigations, tests, briefs). Exposes a streaming API. See [valk-agent spec](2026-03-27-valk-agent-spec.md). |
| **PO Metadata** | Per-ticket annotations owned by the Command Center, not stored in Jira: refinement readiness, quality scores, PO notes. |
| **Jira Sync** | Lightweight index of Jira tickets kept current via webhooks. No content duplication, just enough to render the board. |
| **Activity Feed** | Real-time stream of workspace actions: which skill is running, what tools it calls, intermediate status. |

---

## Features

### 1. Chat

The primary interaction surface. Send tasks to the workspace and receive results.

- Free-text input that maps to workspace skills (create story, investigate, review, assess, etc.)
- Conversation history, persistent across sessions
- Result rendering: story drafts as cards, investigation results as structured output, test reports inline
- Quick actions: re-run, edit & re-send, copy result
- Context awareness: when viewing a ticket on the sprint board, chat knows which ticket is active

### 2. Sprint Board

A board view of the current sprint's tickets with a PO layer on top.

**From Jira (via sync):**
- Ticket key, title, status, assignee, story points
- Sprint assignment
- Current Jira status (To Do, In Progress, Done, etc.)

**PO Metadata (local):**
- Refinement readiness (not ready / in progress / ready)
- Quality score (from /review-story)
- PO notes (free text)
- Effort/value scores (from /assess-story)
- Test status (untested / pass / fail, link to latest report)
- PR/deploy status

**Interactions:**
- Click ticket to open detail view + activate in chat context
- Inline edit PO metadata
- Filter/group by: status, epic, assignee, PO status, sprint (All view)
- Drag to reorder (PO priority, not synced to Jira)
- **Search (VC-032):** inline search in the filter bar filters the ticket table live; full modal (`Cmd+K` or "Search" button in header) does fuzzy DB search across all sprints with a preview pane and Jira live search mode

### 3. Activity Feed

Always-visible side panel showing what the workspace is doing.

- Real-time streaming of workspace events
- Per-task entries: skill name, start time, current step, tool calls
- Status indicators: running, completed, failed
- Click to jump to the chat conversation for that task
- Collapsible detail: expand to see individual tool calls and intermediate results
- Queue: shows pending tasks waiting to be processed

### 4. Jira Sync

Keeps the local ticket index current without polling.

- Jira webhooks for: issue created, updated, deleted, sprint changed, status changed
- Stores: key, title, status, assignee, story points, sprint, labels, priority
- No description/AC sync (content stays in Jira, accessed on demand via API)
- Webhook endpoint with Jira signature verification
- Manual re-sync button as fallback

### 5. Test Center

Overview and control of test execution.

- **Dashboard:** all stories with test status, last run date, pass/fail
- **Run tests:** trigger test execution for a story (via workspace)
- **Live view:** watch a running test, see steps completing in real-time
- **Reports:** view past test reports (HTML), compare runs
- **History:** test runs per story over time

### 6. Refinement Agenda

Pre-refinement preparation view.

- Auto-sorted list of stories by refinement readiness
- One-click: run /refinement-prep for a batch of stories
- Per-story: shows what's missing (AC unclear, no tech analysis, low score)
- Refinement mode: fullscreen story walkthrough, one at a time
  - Left: full story content (from Jira)
  - Center: tech analysis, score, code references
  - Right: live chat for questions during the session

### 7. Alerts

Proactive notifications when PO attention is needed.

- Story moved back to earlier status
- PR merged but story not tested
- Story in sprint without AC
- Refinement scheduled but stories not ready
- Test failure on previously passing story
- Configurable rules (which alerts are active)

### 8. Scheduled Jobs

Manage recurring workspace tasks.

- List all active schedules (brief, pulse, sprint-status, etc.)
- Enable/disable individual jobs
- View last run time + result
- Edit schedule (cron expression)
- Manual trigger ("run now")
- View execution log

### 9. Quick Actions (from ticket cards)

Context menu on any ticket card:

- Investigate (triggers /investigate)
- Review story (triggers /review-story)
- Assess effort (triggers /assess-story)
- Write test scenarios (triggers /write-test-scenarios)
- Run tests (triggers test execution)
- Open in Jira (external link)

Results appear in chat and update the ticket's PO metadata automatically.

### 10. Stakeholder View

Read-only view for non-technical stakeholders.

- What's done this sprint
- What's in progress
- What's coming next sprint
- No technical details, no scores, no test internals
- Shareable via URL (no auth required, or simple token)

### 11. Widgets (Dashboard)

Home screen with at-a-glance information:

- **Morning brief** - latest /brief output rendered as dashboard
- **Pulse ticker** - latest changes since last check
- **Sprint progress** - burndown or progress bar
- **Sprint history** - velocity trend across sprints

---

## Views Summary

| View | Purpose |
|------|---------|
| **Home / Dashboard** | Widgets: brief, pulse, sprint progress, velocity |
| **Chat** | Primary interaction with workspace |
| **Sprint Board** | Ticket overview + PO metadata |
| **Test Center** | Test status, execution, reports |
| **Refinement** | Prep + fullscreen refinement mode |
| **Scheduled Jobs** | Manage recurring tasks |
| **Stakeholder** | Read-only external view |

---

## Data Model (Conceptual)

### Owned by Command Center

```
Ticket (local index)
  - jira_key (PK)
  - title
  - status
  - assignee
  - story_points
  - sprint_name
  - labels
  - priority
  - last_synced_at

TicketMetadata (PO layer)
  - jira_key (FK)
  - refinement_readiness (enum: not_ready, in_progress, ready)
  - quality_score (number, nullable)
  - effort_scores (BV, IE, PE, TE, nullable)
  - po_notes (text)
  - po_priority (sort order)
  - test_status (enum: untested, pass, fail)
  - last_test_run_at
  - last_test_report_url

Conversation
  - id
  - title
  - created_at
  - related_ticket (jira_key, nullable)

Message
  - id
  - conversation_id (FK)
  - role (user / assistant)
  - content
  - timestamp
  - workspace_task_id (nullable, links to activity)

WorkspaceTask
  - id
  - skill_name
  - status (queued, running, completed, failed)
  - started_at
  - completed_at
  - related_ticket (jira_key, nullable)
  - conversation_id (FK, nullable)

ScheduledJob
  - id
  - name
  - cron_expression
  - skill_name
  - enabled (boolean)
  - last_run_at
  - last_result_summary

Alert
  - id
  - type (enum)
  - jira_key (nullable)
  - message
  - created_at
  - read (boolean)
```

### Sourced from Jira (via webhook sync)
- Ticket fields (title, status, assignee, sprint, points)

### Sourced from Workspace (via streaming API)
- Task execution events
- Skill results
- Test reports

---

## Integration Points

| System | Direction | Method |
|--------|-----------|--------|
| **Remote Workspace** | Bidirectional | REST API + SSE/WebSocket for streaming |
| **Jira** | Inbound | Webhooks (issue events) |
| **Jira** | Outbound | REST API (read ticket content on demand) |

---

## Non-Goals (MVP)

- Multi-user / team access
- Mobile app
- Jira content editing (stays in Jira)
- Dependency mapping between tickets
- Team workload visualization
- Notifications via email/push (Slack via workspace is enough)
- Offline mode

---

## Open Questions

1. **Auth:** Does the app need authentication, or is it single-user on a private URL?
2. **Persistence:** SQLite (simple, file-based) vs PostgreSQL (consistent with other projects)?
3. **Hosting:** Coolify alongside the workspace, or separate?
4. **Stakeholder view auth:** Public URL with token, or requires login?
