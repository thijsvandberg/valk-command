# BRDG-040: Stakeholder View

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want a read-only Stakeholder view accessible via a token-based URL that shows sprint progress, completed work, and upcoming items so I can share status with non-technical stakeholders without giving them full app access.

## Acceptance Criteria

### Phase 1: Token-based access
- [ ] Settings page to generate a shareable access token (random UUID)
- [ ] Token stored in `appSetting` table
- [ ] Middleware or route handler that validates token from query parameter (`?token=xxx`)
- [ ] Token can be regenerated (invalidates old one)
- [ ] Stakeholder routes excluded from any future auth middleware

### Phase 2: Stakeholder page
- [ ] New page at `/stakeholder` replacing the current placeholder
- [ ] No sidebar, no settings, no edit actions; clean standalone layout
- [ ] Bridge branding in header
- [ ] Sprint selector (current sprint default)

### Phase 3: Sprint overview section
- [ ] Sprint progress bar (points completed / total)
- [ ] Sprint dates and days remaining
- [ ] Done tickets listed with title and epic grouping
- [ ] In-progress tickets listed with assignee

### Phase 4: Upcoming section
- [ ] Next sprint's planned tickets (if available)
- [ ] Grouped by epic
- [ ] No technical fields (no story points, no Jira keys visible)
- [ ] Human-readable status labels ("Completed", "In Progress", "Planned")

### Phase 5: Polish
- [ ] Auto-refresh every 5 minutes
- [ ] Mobile-responsive layout
- [ ] Print-friendly stylesheet
- [ ] "Last updated" timestamp in footer

## Technical Notes

- Separate layout for `/stakeholder` route (no sidebar, no app chrome)
- Token validation in a layout-level server component or middleware
- Filter out internal PO metadata (quality scores, notes) from stakeholder view
- Use semantic ticket titles; hide Jira keys behind a "details" toggle

## Out of Scope (for now)
- User accounts for stakeholders
- Multiple stakeholder views with different permissions
- Comment or feedback functionality
- Email digest of stakeholder view
