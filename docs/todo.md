# Backlog

## Up Next

- [ ] App shell + navigation - sidebar with routes to all views (Dashboard, Chat, Sprint Board, Test Center, Refinement, Jobs, Stakeholder)
- [ ] Database setup - SQLite + Drizzle ORM, schema from PRD data model
- [ ] Chat view - primary interaction surface, conversation history, message input

## Later

- [ ] Sprint Board - Jira sync + PO metadata layer
- [ ] Activity Feed - real-time workspace event streaming
- [ ] Test Center - test status dashboard, execution, reports
- [ ] Refinement Agenda - prep view + fullscreen refinement mode
- [ ] Alerts - proactive PO notifications
- [ ] Scheduled Jobs - manage recurring workspace tasks
- [ ] Stakeholder View - read-only external view
- [ ] Dashboard Widgets - morning brief, pulse, sprint progress
- [ ] Bot account for proper PR approvals (same-account reviews fall back to COMMENTED; a dedicated bot account would allow real APPROVED status)
- [ ] QA agent for user acceptance testing (when UI exists)
- [ ] Auto-merge PO agent (once the pipeline is proven stable, remove the separate merge agent step)

## Done

- [x] Project scaffold - Next.js 15, TypeScript, Tailwind v4
- [x] Hello world landing page (PR #2)
- [x] Vitest setup (#4) - merged to dev
- [x] Testing rules in CLAUDE.md (#7) - merged to dev
- [x] Branch protection via GitHub API (#6) - configured
