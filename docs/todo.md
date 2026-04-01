# Backlog

## Up Next

- [x] VC-018: Test Stability & CI Reliability (critical - tests hang, 5 failures, intermittent build)
- [ ] VC-019: Database Integrity & Performance (CHECK constraint mismatch, missing indexes, N+1 queries, race condition)
- [ ] VC-020: API Route Hardening (input validation, error sanitization, agent proxy safety)
- [ ] VC-021: Jira Sync Resilience (rate limiting, retry logic, cancel race condition, cache staleness)
- [ ] VC-022: Frontend Quality & Component Health (memory leaks, error boundaries, 2162-line page decomposition)

## Later

- [ ] Sprint Board - Jira sync + PO metadata layer
- [ ] Activity Feed - real-time workspace event streaming
- [ ] Test Center - test status dashboard, execution, reports
- [ ] Refinement Agenda - prep view + fullscreen refinement mode
- [ ] Alerts - proactive PO notifications
- [ ] Scheduled Jobs - manage recurring workspace tasks
- [ ] Stakeholder View - read-only external view
- [ ] Dashboard Widgets - morning brief, sprint progress, velocity
- [ ] Bot account for proper PR approvals (same-account reviews fall back to COMMENTED; a dedicated bot account would allow real APPROVED status)
- [ ] QA agent for user acceptance testing (when UI exists)
- [ ] Auto-merge PO agent (once the pipeline is proven stable, remove the separate merge agent step)

## Done

- [x] Project scaffold - Next.js 15, TypeScript, Tailwind v4
- [x] Hello world landing page (#1)
- [x] Vitest setup (#4)
- [x] CI pipeline with lint, typecheck, and tests (#5)
- [x] Branch protection via GitHub API (#6)
- [x] Testing rules in CLAUDE.md (#7)
- [x] Automated changelog page (#14)
- [x] App shell + sidebar navigation (#16)
- [x] View placeholder pages for all routes (#17)
- [x] Database setup - SQLite + Drizzle ORM, schema from PRD (#19)
- [x] Chat UI layout with conversation list and messages (#20)
- [x] Chat API routes for conversations and messages (#21)
- [x] Wire Chat UI to API (#22)
- [x] Add changelog link to sidebar navigation (#30)
