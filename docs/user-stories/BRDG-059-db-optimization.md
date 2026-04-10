# BRDG-059: Database Query Optimization

**Status:** Open
**Priority:** Medium

## Description

As a developer, I want optimized SQLite queries with proper indexes, prepared statements, and query timing so the API maintains sub-100ms response times as the dataset grows.

## Acceptance Criteria

### Phase 1: Index audit
- [ ] Audit all database queries across API routes
- [ ] Identify missing indexes on frequently filtered/sorted columns
- [ ] Add indexes: `ticket.sprint`, `ticket.status`, `ticket.assignee`, `ticket.epic`
- [ ] Add indexes: `activityLog.createdAt`, `activityLog.type`
- [ ] Add composite index: `ticket(sprint, status)` for sprint board queries
- [ ] Drizzle migration for new indexes

### Phase 2: Query optimization
- [ ] Replace N+1 query patterns with JOINs or batch queries
- [ ] Use `.prepare()` for frequently executed queries (Drizzle prepared statements)
- [ ] Audit `SELECT *` usage; select only needed columns where possible
- [ ] Add LIMIT clauses to unbounded queries

### Phase 3: Query timing
- [ ] Middleware or utility that logs query execution time
- [ ] Warn in console for queries exceeding 100ms
- [ ] Expose timing data in API response headers (`X-Query-Time-Ms`)
- [ ] Aggregate query stats accessible via `GET /api/debug/query-stats` (dev only)

### Phase 4: Database maintenance
- [ ] Add `PRAGMA optimize` call on app startup
- [ ] Configure WAL mode for better concurrent read performance
- [ ] Add periodic VACUUM suggestion in activity log when DB exceeds size threshold

## Technical Notes

- SQLite performs well up to ~100k rows without tuning; indexes help beyond that
- Drizzle ORM supports `.prepare()` for compiled statements
- WAL mode: set `PRAGMA journal_mode=WAL` in database initialization
- Query timing: wrap Drizzle queries in a timing utility function
- Be careful with composite indexes; order matters for query planner

## Out of Scope (for now)
- Migration to PostgreSQL
- Read replicas
- Connection pooling (single-user, SQLite)
- Full-text search indexes (separate story BRDG-053)
