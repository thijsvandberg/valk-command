# Improvement Roadmap

**Date:** 2026-04-10
**Scope:** Comprehensive audit of valk-command with 43 proposed user stories across 7 categories.

## Current State

Bridge (valk-command) has 32 completed user stories covering: Sprint Board, Ticket Detail, Story Writer, Jira Sync, Activity Log, Rich Editor, Search, and Bitbucket Dev Panel. Three placeholder pages remain (Test Center, Refinement, Stakeholder). The app has no authentication, no rate limiting, and no monitoring. The dashboard is a static intro page.

## Categories

### 1. New Features (7 stories)

Core features from the original PRD that are not yet implemented, plus new capabilities.

| # | Story | Priority | Summary |
|---|-------|----------|---------|
| BRDG-037 | [Dashboard Widgets](../user-stories/BRDG-037-dashboard-widgets.md) | High | Sprint progress, velocity trend, attention items, activity feed, story writer stats |
| BRDG-038 | [Refinement Agenda](../user-stories/BRDG-038-refinement-agenda.md) | High | Auto-sorted backlog, readiness checklist, fullscreen refinement mode with timer |
| BRDG-039 | [Test Center](../user-stories/BRDG-039-test-center.md) | High | Pipeline results per ticket, manual test tracking, release readiness score |
| BRDG-040 | [Stakeholder View](../user-stories/BRDG-040-stakeholder-view.md) | Medium | Token-based read-only view for non-technical stakeholders |
| BRDG-041 | [Proactive Alerts](../user-stories/BRDG-041-proactive-alerts.md) | High | Configurable alerts for stale scores, missing AC, sync failures, unreviewed PRs |
| BRDG-042 | [Bulk Story Writer](../user-stories/BRDG-042-bulk-story-writer.md) | Medium | Batch story writing for multiple tickets in one session |
| BRDG-043 | [Sprint Retro Report](../user-stories/BRDG-043-sprint-retrospective-report.md) | Low | Velocity analysis, carry-over tracking, quality trends, exportable report |

### 2. New Data Views (5 stories)

New ways to look at existing data to surface insights.

| # | Story | Priority | Summary |
|---|-------|----------|---------|
| BRDG-044 | [Epic Progress View](../user-stories/BRDG-044-epic-progress-view.md) | Medium | Per-epic aggregation with completion bars and cross-sprint timeline |
| BRDG-045 | [Quality Heatmap](../user-stories/BRDG-045-quality-heatmap.md) | Medium | Color-coded grid of tickets by quality score, sprint comparison |
| BRDG-046 | [Team Workload View](../user-stories/BRDG-046-team-workload-view.md) | Medium | Per-assignee ticket count, points, status distribution, overload detection |
| BRDG-047 | [Changelog / Release Notes](../user-stories/BRDG-047-changelog-release-notes.md) | Low | Auto-generated changelog per sprint, grouped by epic, exportable |
| BRDG-048 | [Story Writer Analytics](../user-stories/BRDG-048-story-writer-analytics.md) | Low | Usage metrics: sessions, drafts, acceptance rate, ROI tracking |

### 3. Improve Existing (6 stories)

Enhancements to features that already work but could be better.

| # | Story | Priority | Summary |
|---|-------|----------|---------|
| BRDG-049 | [Sprint Board Drag-and-Drop](../user-stories/BRDG-049-sprint-board-dnd.md) | Medium | Drag tickets between status columns, Kanban column view |
| BRDG-050 | [Story Writer Pane System](../user-stories/BRDG-050-story-writer-panes.md) | Medium | Flexible 1-3 pane layout (Chat, Editor, Diff, History, Related) |
| BRDG-051 | [Inline Editing on Sprint Board](../user-stories/BRDG-051-inline-editing.md) | Medium | Double-click to edit points, PO status, notes without opening side panel |
| BRDG-052 | [Rich Editor Slash Commands](../user-stories/BRDG-052-editor-slash-commands.md) | Low | / commands for callouts, tables, templates, AC blocks |
| BRDG-053 | [Advanced Search](../user-stories/BRDG-053-advanced-search.md) | Medium | Filters (status, sprint, assignee), grouped results, saved searches |
| BRDG-054 | [Activity Log Insights](../user-stories/BRDG-054-activity-log-insights.md) | Low | Stats header, recurring failure analysis, health score |

### 4. Make It Faster (5 stories)

Performance improvements for responsiveness and scalability.

| # | Story | Priority | Summary |
|---|-------|----------|---------|
| BRDG-055 | [API Caching Layer](../user-stories/BRDG-055-api-caching.md) | Medium | In-memory cache with TTL and smart invalidation on sync |
| BRDG-056 | [Optimistic UI Updates](../user-stories/BRDG-056-optimistic-ui.md) | Medium | Instant visual feedback on Sprint Board actions via SWR mutations |
| BRDG-057 | [Virtual Scrolling](../user-stories/BRDG-057-virtual-scrolling.md) | Low | @tanstack/react-virtual for sprints with 50+ tickets |
| BRDG-058 | [Prefetch Adjacent Views](../user-stories/BRDG-058-prefetch.md) | Low | Preload ticket details on hover, adjacent sprint data |
| BRDG-059 | [Database Optimization](../user-stories/BRDG-059-db-optimization.md) | Medium | Index audit, prepared statements, query timing, WAL mode |

### 5. Make It More Secure (6 stories)

Security hardening from zero auth to production-ready.

| # | Story | Priority | Summary |
|---|-------|----------|---------|
| BRDG-060 | [Authentication](../user-stories/BRDG-060-authentication.md) | **Critical** | Password-based login, session management, middleware protection |
| BRDG-061 | [Rate Limiting](../user-stories/BRDG-061-rate-limiting.md) | High | Per-endpoint rate limits, external API quota protection |
| BRDG-062 | [Input Sanitization](../user-stories/BRDG-062-input-sanitization.md) | **Critical** | XSS prevention, Zod validation on all APIs, SQL injection audit |
| BRDG-063 | [Env Variable Validation](../user-stories/BRDG-063-env-validation.md) | High | .env.example, Zod startup validation, typed env access |
| BRDG-064 | [Secret Management](../user-stories/BRDG-064-secret-management.md) | Medium | Encrypted token storage, rotation UI, health monitoring |
| BRDG-065 | [Security Headers](../user-stories/BRDG-065-security-headers.md) | **Critical** | CSP, X-Frame-Options, HSTS, Permissions-Policy |

### 6. Make It More User-Friendly (7 stories)

UX improvements for faster, more intuitive workflows.

| # | Story | Priority | Summary |
|---|-------|----------|---------|
| BRDG-066 | [Keyboard Shortcuts](../user-stories/BRDG-066-keyboard-shortcuts.md) | Medium | G+D/S/C navigation, /, N, J/K list navigation, ? help overlay |
| BRDG-067 | [Command Palette](../user-stories/BRDG-067-command-palette.md) | Medium | Cmd+K to search pages, tickets, conversations, and trigger actions |
| BRDG-068 | [Onboarding & Empty States](../user-stories/BRDG-068-onboarding-empty-states.md) | Low | First-run wizard, meaningful empty states, feature hints |
| BRDG-069 | [Notification Center](../user-stories/BRDG-069-notification-center.md) | Medium | Bell icon with dropdown, unread count, per-event notifications |
| BRDG-070 | [Contextual Help](../user-stories/BRDG-070-contextual-help.md) | Low | Tooltips on quality scores, PO statuses, sync indicators |
| BRDG-071 | [Customizable Columns](../user-stories/BRDG-071-customizable-columns.md) | Medium | Show/hide and reorder Sprint Board columns, presets |
| BRDG-072 | [Undo/Redo](../user-stories/BRDG-072-undo-redo.md) | Low | Toast-based undo for destructive actions (delete, status change) |

### 7. Connect Additional Sources (7 stories)

New integrations to bring external data into Bridge.

| # | Story | Priority | Summary |
|---|-------|----------|---------|
| BRDG-073 | [Confluence](../user-stories/BRDG-073-confluence.md) | Medium | Link pages to tickets, inline preview, auto-detection of URLs |
| BRDG-074 | [Slack](../user-stories/BRDG-074-slack.md) | Medium | Webhook notifications for events, sprint summary posting |
| BRDG-075 | [GitHub](../user-stories/BRDG-075-github.md) | Low | Dev Panel support for GitHub repos alongside Bitbucket |
| BRDG-076 | [Figma](../user-stories/BRDG-076-figma.md) | Low | Link designs to tickets, thumbnail previews |
| BRDG-077 | [Google Calendar](../user-stories/BRDG-077-google-calendar.md) | Low | Upcoming ceremonies widget on Dashboard |
| BRDG-078 | [CI/CD Pipeline Feed](../user-stories/BRDG-078-cicd-pipeline-feed.md) | Medium | Real-time pipeline runs, ticket linkage, deploy tracking |
| BRDG-079 | [Time Tracking](../user-stories/BRDG-079-time-tracking.md) | Low | Tempo/Clockify hours per ticket, estimate vs actual |

## Priority Distribution

| Priority | Count | Stories |
|----------|-------|---------|
| **Critical** | 3 | BRDG-060, BRDG-062, BRDG-065 |
| **High** | 6 | BRDG-037, BRDG-038, BRDG-039, BRDG-041, BRDG-061, BRDG-063 |
| **Medium** | 20 | BRDG-040, BRDG-042, BRDG-044, BRDG-045, BRDG-046, BRDG-049, BRDG-050, BRDG-051, BRDG-053, BRDG-055, BRDG-056, BRDG-059, BRDG-064, BRDG-066, BRDG-067, BRDG-069, BRDG-071, BRDG-073, BRDG-074, BRDG-078 |
| **Low** | 14 | BRDG-043, BRDG-047, BRDG-048, BRDG-052, BRDG-054, BRDG-057, BRDG-058, BRDG-068, BRDG-070, BRDG-072, BRDG-075, BRDG-076, BRDG-077, BRDG-079 |

## Recommended Implementation Order

### Wave 1: Security Foundation
BRDG-060 (Auth) > BRDG-065 (Security Headers) > BRDG-062 (Input Sanitization) > BRDG-063 (Env Validation) > BRDG-061 (Rate Limiting)

### Wave 2: Core Missing Features
BRDG-037 (Dashboard) > BRDG-038 (Refinement) > BRDG-041 (Alerts) > BRDG-039 (Test Center)

### Wave 3: UX and Performance
BRDG-067 (Cmd+K) > BRDG-066 (Shortcuts) > BRDG-056 (Optimistic UI) > BRDG-059 (DB Optimization) > BRDG-055 (Caching)

### Wave 4: Enhanced Views
BRDG-049 (DnD) > BRDG-051 (Inline Edit) > BRDG-071 (Custom Columns) > BRDG-050 (Story Writer Panes) > BRDG-053 (Search)

### Wave 5: Integrations
BRDG-074 (Slack) > BRDG-073 (Confluence) > BRDG-078 (Pipelines) > BRDG-069 (Notifications)

### Wave 6: Polish and Extras
Remaining stories based on evolving priorities.
