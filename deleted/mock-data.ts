// Types and constants are now sourced from @/types/ticket.
// This file re-exports them for backward compatibility during the mock->API migration.
import type { IssueType, JiraStatus, POStatus, Assignee, Attachment, Subtask, LinkedIssue, JiraComment, TicketDetail, Ticket, Sprint } from "@/types/ticket";

export type {
  IssueType,
  JiraStatus,
  POStatus,
  Assignee,
  Attachment,
  Subtask,
  LinkedIssue,
  JiraComment,
  TicketDetail,
  Ticket,
  Sprint,
};

export { PO_STATUS_OPTIONS } from "@/types/ticket";

export const MOCK_SPRINTS: Sprint[] = [
  { id: "10048", name: "BT: 134", dateRange: "31 Mar - 9 Apr", state: "active", ticketCount: 10 },
  { id: "10050", name: "BT Sprint 135 candidates", dateRange: "", state: "future", ticketCount: 5 },
  { id: "10033", name: "BT: Next Sprint", dateRange: "", state: "future", ticketCount: 3 },
  { id: "10047", name: "BT: 133", dateRange: "24 Mar - 31 Mar", state: "closed", ticketCount: 22 },
  { id: "10046", name: "BT: 132", dateRange: "17 Mar - 24 Mar", state: "closed", ticketCount: 19 },
  { id: "10045", name: "BT: 131", dateRange: "10 Mar - 17 Mar", state: "closed", ticketCount: 21 },
  { id: "10044", name: "BT: 130", dateRange: "3 Mar - 10 Mar", state: "closed", ticketCount: 17 },
];

export { EPIC_COLORS } from "@/types/ticket";

export const MOCK_SLOT_SPRINTS = ["10048", "10050", "10033"];

export const MOCK_TICKETS: Ticket[] = [
  {
    key: "VPL-29223",
    title: "Monitoring Kibana (PROD) & heartbeat channel",
    type: "task",
    epic: "LOGGING & METRICS",
    jiraStatus: "TO DO",
    storyPoints: null,
    assignee: null,
    flagged: false,
    poStatus: "Ready",
    qualityScore: 82,
    qualityStale: false,
    notes: "",
    sprintId: "10048",
  },
  {
    key: "VPL-44062",
    title: "Confirmation page extra preview does not hide mealplan extras included in rate",
    type: "bug",
    epic: "BT: UPSELL",
    jiraStatus: "IN PROGRESS",
    storyPoints: null,
    assignee: { name: "Jan de Vries", initials: "JV", color: "#5b7fc4" },
    flagged: true,
    poStatus: "Ready",
    qualityScore: 71,
    qualityStale: true,
    notes: "Reported by Booking.com partner manager. High priority fix.",
    sprintId: "10048",
  },
  {
    key: "VPL-43237",
    title: "Validate that selected rate belongs to the chosen package/deal on reservation creation",
    type: "subtask",
    epic: null,
    jiraStatus: "IN PROGRESS",
    storyPoints: 2,
    assignee: { name: "Vera Zwart", initials: "VZ", color: "#8b5cf6" },
    flagged: false,
    poStatus: "Ready",
    qualityScore: 88,
    qualityStale: false,
    notes: "",
    sprintId: "10048",
  },
  {
    key: "VPL-43241",
    title: "Calamiteiten / Rollback plan",
    type: "story",
    epic: null,
    jiraStatus: "IN PROGRESS",
    storyPoints: null,
    assignee: { name: "Mark Rutte", initials: "MR", color: "#2e9149" },
    flagged: false,
    poStatus: "Uitwerken",
    qualityScore: null,
    qualityStale: false,
    notes: "Needs input from ops team on current rollback procedures.",
    sprintId: "10048",
  },
  {
    key: "VPL-44060",
    title: "Add caching to hotel-service accommodation-types endpoint (and terms-and-conditions while we're at it)",
    type: "story",
    epic: "TECH: GENERAL IMP.",
    jiraStatus: "TO DO",
    storyPoints: 1,
    assignee: null,
    flagged: false,
    poStatus: "Klaar voor refinement",
    qualityScore: 65,
    qualityStale: false,
    notes: "",
    sprintId: "10048",
  },
  {
    key: "VPL-37366",
    title: "Implement age bucket pricing for extras in upsell app and in all receipts",
    type: "story",
    epic: "BT: UPSELL",
    jiraStatus: "TO DO",
    storyPoints: null,
    assignee: null,
    flagged: false,
    poStatus: "Wachten op feedback",
    qualityScore: 45,
    qualityStale: false,
    notes: "Waiting for pricing team to confirm age bracket definitions.",
    sprintId: "10048",
  },
  {
    key: "VPL-33796",
    title: 'Show "vanaf" prices when not all prices in dailyprices are equal',
    type: "story",
    epic: "BT: UPSELL",
    jiraStatus: "TO DO",
    storyPoints: null,
    assignee: null,
    flagged: false,
    poStatus: "Klaar voor refinement",
    qualityScore: 73,
    qualityStale: true,
    notes: "",
    sprintId: "10048",
  },
  {
    key: "VPL-41192",
    title: "Only show PES when there is a price and availability for the date(s) where the extra is actually booked",
    type: "story",
    epic: "BT: UPSELL",
    jiraStatus: "TO DO",
    storyPoints: null,
    assignee: null,
    flagged: false,
    poStatus: null,
    qualityScore: null,
    qualityStale: false,
    notes: "",
    sprintId: "10048",
  },
  {
    key: "VPL-43566",
    title: "Upsell: Enable reservations for extra's which have inventory items configured in Daylight PMS",
    type: "story",
    epic: "BT: UPSELL",
    jiraStatus: "TO DO",
    storyPoints: null,
    assignee: null,
    flagged: false,
    poStatus: "Nieuw",
    qualityScore: null,
    qualityStale: false,
    notes: "",
    sprintId: "10048",
  },
  {
    key: "VPL-43734",
    title: "Implement stripped down upsell confirmation emails for OTA reservations",
    type: "story",
    epic: "BT: UPSELL",
    jiraStatus: "TO DO",
    storyPoints: 2,
    assignee: null,
    flagged: false,
    poStatus: "Uitwerken",
    qualityScore: 28,
    qualityStale: false,
    notes: "Need to align email template with brand guidelines.",
    sprintId: "10050",
  },
  {
    key: "VPL-39544",
    title: "Serve bookingtool on hotel domain under /booking/ for seamless GA tracking",
    type: "story",
    epic: null,
    jiraStatus: "TO DO",
    storyPoints: 3,
    assignee: null,
    flagged: false,
    poStatus: null,
    qualityScore: null,
    qualityStale: false,
    notes: "",
    sprintId: "10050",
  },
  {
    key: "VPL-44150",
    title: "Target blank hotelsite links in no avail dialogs",
    type: "task",
    epic: null,
    jiraStatus: "TO DO",
    storyPoints: null,
    assignee: null,
    flagged: false,
    poStatus: "Ready",
    qualityScore: 91,
    qualityStale: false,
    notes: "",
    sprintId: "10050",
  },
  {
    key: "VPL-43242",
    title: "Configure UATs with more prod-like data",
    type: "task",
    epic: null,
    jiraStatus: "TO DO",
    storyPoints: null,
    assignee: { name: "Mark Rutte", initials: "MR", color: "#2e9149" },
    flagged: false,
    poStatus: "Wachten op feedback",
    qualityScore: null,
    qualityStale: false,
    notes: "Blocked: need DB dump approval from security team.",
    sprintId: "10050",
  },
  {
    key: "VPL-43521",
    title: "Test handmatige extra's op reservering",
    type: "task",
    epic: "BT: UPSELL",
    jiraStatus: "TO DO",
    storyPoints: null,
    assignee: null,
    flagged: false,
    poStatus: null,
    qualityScore: null,
    qualityStale: false,
    notes: "",
    sprintId: "10050",
  },
  {
    key: "VPL-43372",
    title: "Rollout Temporal Loyal flow",
    type: "task",
    epic: null,
    jiraStatus: "TO DO",
    storyPoints: null,
    assignee: { name: "Sophie Bakker", initials: "SB", color: "#c4723a" },
    flagged: false,
    poStatus: "Klaar voor refinement",
    qualityScore: 58,
    qualityStale: false,
    notes: "",
    sprintId: "10033",
  },
  {
    key: "VPL-43001",
    title: "Document Extras / create manual",
    type: "story",
    epic: "BT: UPSELL",
    jiraStatus: "TEST",
    storyPoints: 2,
    assignee: { name: "Lisa Timmermans", initials: "LT", color: "#c44a7a" },
    flagged: true,
    poStatus: "Ready",
    qualityScore: 76,
    qualityStale: false,
    notes: "",
    sprintId: "10048",
  },
  {
    key: "VPL-44145",
    title: "Create followup story for GXP (based on VPL-38475)",
    type: "task",
    epic: null,
    jiraStatus: "TO DO",
    storyPoints: null,
    assignee: null,
    flagged: false,
    poStatus: "Nieuw",
    qualityScore: null,
    qualityStale: false,
    notes: "",
    sprintId: "10033",
  },
  {
    key: "VPL-43900",
    title: "Fix double-booking edge case in concurrent reservation flow",
    type: "bug",
    epic: null,
    jiraStatus: "TO DO",
    storyPoints: null,
    assignee: null,
    flagged: false,
    poStatus: "Geparkeerd",
    qualityScore: 35,
    qualityStale: true,
    notes: "Parked until race condition root cause is identified by backend team.",
    sprintId: "10033",
  },
];

export const MOCK_TICKET_DETAILS: Record<string, TicketDetail> = {
  "VPL-44062": {
    description: `## Problem

On the confirmation page, the extra preview section displays mealplan extras that are **already included in the selected rate**. This causes confusion for guests who think they need to add (and pay for) extras that are already part of their booking.

## Expected Behavior

- Mealplan extras that are included in the rate should **not** appear in the upsell preview section
- Only extras that are genuinely optional and purchasable should be displayed

## Reproduction Steps

1. Search for a hotel with a rate that includes breakfast (e.g. "Bed & Breakfast" rate)
2. Select the rate and proceed to the confirmation page
3. Observe the extras preview section

## Acceptance Criteria

- [ ] Extras included in the selected rate are filtered from the upsell preview
- [ ] The filtering logic uses the \`includedExtras\` field from the rate response
- [ ] Unit tests cover the filtering logic
- [ ] Manual verification on staging with at least 3 different rate/extra combinations`,
    reporter: { name: "Pieter Groot", initials: "PG", color: "#6b8e6b" },
    labels: ["booking-engine", "upsell", "bug-fix"],
    components: ["bookingtool-frontend", "extras-service"],
    priority: "High",
    createdAt: "2026-03-15T10:23:00Z",
    updatedAt: "2026-03-29T14:45:00Z",
    attachments: [
      { id: "att-1", filename: "confirmation-page-bug.png", mimeType: "image/png", size: 245000, createdAt: "2026-03-15T10:25:00Z", color: "#d97744", cleaned: false, cleanedAt: null },
      { id: "att-2", filename: "rate-response-example.json", mimeType: "application/json", size: 4200, createdAt: "2026-03-15T10:26:00Z", color: "#44aabb", cleaned: false, cleanedAt: null },
      { id: "att-3", filename: "expected-behavior.png", mimeType: "image/png", size: 189000, createdAt: "2026-03-16T09:00:00Z", color: "#a05ac8", cleaned: true, cleanedAt: "2026-03-28T00:00:00Z" },
    ],
    subtasks: [
      { key: "VPL-44063", title: "Add includedExtras filter to extras preview component", type: "subtask", jiraStatus: "IN PROGRESS", assignee: { name: "Jan de Vries", initials: "JV", color: "#5b7fc4" } },
      { key: "VPL-44064", title: "Write unit tests for rate-extras filtering", type: "subtask", jiraStatus: "TO DO", assignee: null },
    ],
    linkedIssues: [
      { relation: "is blocked by", key: "VPL-43900", title: "Fix double-booking edge case in concurrent reservation flow", type: "bug", jiraStatus: "TO DO", assignee: null },
      { relation: "relates to", key: "VPL-37366", title: "Implement age bucket pricing for extras in upsell app and in all receipts", type: "story", jiraStatus: "TO DO", assignee: null },
      { relation: "blocks", key: "VPL-43734", title: "Implement stripped down upsell confirmation emails for OTA reservations", type: "story", jiraStatus: "TO DO", assignee: null },
    ],
    jiraComments: [
      { id: "jc-1", authorName: "Pieter Groot", authorAvatar: null, authorInitials: "PG", authorColor: "#6b8e6b", content: "This was reported by the Booking.com partner manager. They flagged it as affecting multiple properties. Prioritizing accordingly.", createdAt: "2026-03-15T10:30:00Z" },
      { id: "jc-2", authorName: "Jan de Vries", authorAvatar: null, authorInitials: "JV", authorColor: "#5b7fc4", content: "I've looked into this. The issue is in the `ExtrasPreview` component which doesn't check the `includedExtras` array from the rate. Should be a straightforward fix but we need to verify across all rate types.", createdAt: "2026-03-20T15:12:00Z" },
      { id: "jc-3", authorName: "Lisa Timmermans", authorAvatar: null, authorInitials: "LT", authorColor: "#c44a7a", content: "Confirmed this also happens with half-board rates on the staging environment. Adding the staging URL to the ticket for reference.", createdAt: "2026-03-22T09:45:00Z" },
    ],
  },
  "VPL-43241": {
    description: `## Goal

Create a comprehensive disaster recovery and rollback plan for the Valk Platform production environment. This plan should document procedures for rolling back deployments, recovering from data corruption, and handling infrastructure failures.

## Scope

### In Scope
- Deployment rollback procedures for each service
- Database migration rollback steps
- Infrastructure failure recovery (Kubernetes, CDN, DNS)
- Communication protocols during incidents
- Post-incident review template

### Out of Scope
- Actual implementation of automated rollback tooling (separate story)
- Third-party service outage handling (separate runbook)

## Acceptance Criteria

- [ ] Rollback procedure documented for each deployable service
- [ ] Database rollback procedure covers both schema and data migrations
- [ ] Infrastructure recovery steps verified with ops team
- [ ] Communication escalation matrix defined
- [ ] Dry-run of at least one rollback scenario completed on staging
- [ ] Document reviewed and approved by Tech Lead + Ops Lead`,
    reporter: { name: "Sophie Bakker", initials: "SB", color: "#c4723a" },
    labels: ["operations", "documentation"],
    components: ["platform-ops"],
    priority: "Medium",
    createdAt: "2026-03-10T08:15:00Z",
    updatedAt: "2026-03-28T11:30:00Z",
    attachments: [
      { id: "att-4", filename: "current-deployment-flow.pdf", mimeType: "application/pdf", size: 1200000, createdAt: "2026-03-10T08:20:00Z", color: "#e5534b", cleaned: false, cleanedAt: null },
    ],
    subtasks: [],
    linkedIssues: [
      { relation: "relates to", key: "VPL-43242", title: "Configure UATs with more prod-like data", type: "task", jiraStatus: "TO DO", assignee: { name: "Mark Rutte", initials: "MR", color: "#2e9149" } },
    ],
    jiraComments: [
      { id: "jc-4", authorName: "Mark Rutte", authorAvatar: null, authorInitials: "MR", authorColor: "#2e9149", content: "I have started drafting the Kubernetes rollback section. Will share the draft by end of week.", createdAt: "2026-03-12T14:00:00Z" },
    ],
  },
  "VPL-44060": {
    description: `## Context

The \`/accommodation-types\` endpoint in hotel-service is called frequently and returns relatively static data. Currently, every request hits the database, causing unnecessary load.

The same applies to the \`/terms-and-conditions\` endpoint which is even more static.

## Implementation

1. Add an in-memory cache (e.g. **Caffeine**) with a TTL of **5 minutes** for accommodation types
2. Add a similar cache with a TTL of **15 minutes** for terms and conditions
3. Add a cache-bust endpoint or header for manual invalidation
4. Add cache hit/miss metrics to the existing Micrometer setup

## Acceptance Criteria

- [ ] Accommodation-types endpoint responds from cache on repeated calls
- [ ] Terms-and-conditions endpoint responds from cache on repeated calls
- [ ] Cache TTLs are configurable via application properties
- [ ] Cache metrics exposed via \`/actuator/metrics\`
- [ ] Performance test shows >90% reduction in DB queries for these endpoints`,
    reporter: { name: "Vera Zwart", initials: "VZ", color: "#8b5cf6" },
    labels: ["performance", "backend"],
    components: ["hotel-service"],
    priority: "Low",
    createdAt: "2026-03-25T16:00:00Z",
    updatedAt: "2026-03-27T09:30:00Z",
    attachments: [],
    subtasks: [],
    linkedIssues: [],
    jiraComments: [],
  },
  "VPL-29223": {
    description: `## Objective

Set up production monitoring in **Kibana** and configure a **heartbeat channel** so the team is alerted when critical services go down.

## Requirements

### Kibana Dashboard
- Create a dashboard in the production Kibana instance covering:
  - HTTP 5xx error rates per service
  - Average and p99 response times
  - JVM heap usage and GC pause times
  - Database connection pool saturation

### Heartbeat Channel
- Configure Elastic Heartbeat to ping every public-facing endpoint every **30 seconds**
- Route alerts to the \`#platform-alerts\` channel
- Set thresholds:
  - **Warning**: 2 consecutive failures
  - **Critical**: 5 consecutive failures

## Acceptance Criteria

- [ ] Kibana dashboard created and shared with the team
- [ ] Heartbeat monitors configured for all production endpoints
- [ ] Alert routing verified end-to-end (trigger a test failure)
- [ ] Runbook link included in every alert message`,
    reporter: { name: "Sophie Bakker", initials: "SB", color: "#c4723a" },
    labels: ["monitoring", "observability"],
    components: ["platform-ops", "kibana"],
    priority: "High",
    createdAt: "2026-01-20T09:00:00Z",
    updatedAt: "2026-03-25T10:15:00Z",
    attachments: [
      { id: "att-5", filename: "kibana-dashboard-draft.png", mimeType: "image/png", size: 320000, createdAt: "2026-02-10T14:30:00Z", color: "#44aabb", cleaned: false, cleanedAt: null },
    ],
    subtasks: [
      { key: "VPL-29224", title: "Create Kibana dashboard for HTTP metrics", type: "subtask", jiraStatus: "DONE", assignee: { name: "Sophie Bakker", initials: "SB", color: "#c4723a" } },
      { key: "VPL-29225", title: "Configure Heartbeat monitors", type: "subtask", jiraStatus: "IN PROGRESS", assignee: { name: "Sophie Bakker", initials: "SB", color: "#c4723a" } },
    ],
    linkedIssues: [
      { relation: "relates to", key: "VPL-43242", title: "Configure UATs with more prod-like data", type: "task", jiraStatus: "TO DO", assignee: { name: "Mark Rutte", initials: "MR", color: "#2e9149" } },
    ],
    jiraComments: [
      { id: "jc-5", authorName: "Sophie Bakker", authorAvatar: null, authorInitials: "SB", authorColor: "#c4723a", content: "Dashboard draft is ready. Need feedback on which metrics to prioritize on the main view vs. drilldown panels.", createdAt: "2026-02-12T11:00:00Z" },
    ],
  },
  "VPL-43237": {
    description: `## Problem

When creating a reservation, the selected rate is not validated against the chosen package/deal. This means it is possible to submit a reservation with a rate that does not belong to the selected package, causing pricing discrepancies downstream.

## Expected Behavior

The reservation creation endpoint should validate that the \`rateId\` belongs to the selected \`packageId\` / \`dealId\`. If the rate does not match, the request should be rejected with a **400 Bad Request** and a clear error message.

## Implementation Notes

- Validation should happen in the \`ReservationService.create()\` method
- The rate-to-package mapping is available via \`RateRepository.findByPackageId()\`
- Frontend currently does not enforce this either; backend validation is the safety net

## Acceptance Criteria

- [ ] Backend rejects reservations where rateId does not belong to the packageId
- [ ] Error response includes a human-readable message
- [ ] Existing valid reservations are not affected
- [ ] Integration test covers the mismatch scenario
- [ ] Frontend shows the error message when the backend rejects`,
    reporter: { name: "Vera Zwart", initials: "VZ", color: "#8b5cf6" },
    labels: ["validation", "backend", "booking-engine"],
    components: ["reservation-service"],
    priority: "High",
    createdAt: "2026-03-08T11:30:00Z",
    updatedAt: "2026-03-29T16:00:00Z",
    attachments: [],
    subtasks: [
      { key: "VPL-43238", title: "Add rate-package validation to ReservationService", type: "subtask", jiraStatus: "IN PROGRESS", assignee: { name: "Vera Zwart", initials: "VZ", color: "#8b5cf6" } },
      { key: "VPL-43239", title: "Write integration test for rate mismatch", type: "subtask", jiraStatus: "TO DO", assignee: null },
    ],
    linkedIssues: [
      { relation: "relates to", key: "VPL-44062", title: "Confirmation page extra preview does not hide mealplan extras included in rate", type: "bug", jiraStatus: "IN PROGRESS", assignee: { name: "Jan de Vries", initials: "JV", color: "#5b7fc4" } },
    ],
    jiraComments: [
      { id: "jc-6", authorName: "Vera Zwart", authorAvatar: null, authorInitials: "VZ", authorColor: "#8b5cf6", content: "I found the root cause. The create endpoint only checks if the rate exists, not whether it belongs to the package. Adding the validation now.", createdAt: "2026-03-22T10:30:00Z" },
      { id: "jc-7", authorName: "Jan de Vries", authorAvatar: null, authorInitials: "JV", authorColor: "#5b7fc4", content: "Related to my work on VPL-44062. The frontend also needs to prevent sending invalid combinations in the first place.", createdAt: "2026-03-23T14:15:00Z" },
    ],
  },
  "VPL-33796": {
    description: `## User Story

As a guest, I want to see **"vanaf" (starting from) prices** when the daily prices for an extra are not all equal, so I understand that the displayed price is a minimum and may vary.

## Current Behavior

The extras page shows a single price regardless of whether daily prices differ. Guests see e.g. "5.00 per person per night" even when some nights cost 7.50.

## Desired Behavior

- When all daily prices are equal: show the price normally (e.g. "5.00 per person per night")
- When daily prices differ: prefix with "vanaf" (e.g. "vanaf 5.00 per person per night")
- The confirmation page always shows the **actual total**, never the "vanaf" price

## Scenarios

| Stay | Daily prices | Display |
|------|-------------|---------|
| 3 nights | 5.00, 5.00, 5.00 | 5.00 per person per night |
| 3 nights | 5.00, 7.50, 5.00 | vanaf 5.00 per person per night |
| 2 nights | 10.00, 0.00 | vanaf 0.00 per person per night |

## Acceptance Criteria

- [ ] "vanaf" label appears when daily prices differ
- [ ] Lowest price among available days is shown
- [ ] Confirmation page shows exact total
- [ ] Works for both per-person and per-room price types
- [ ] Unit tests for price comparison logic`,
    reporter: { name: "Pieter Groot", initials: "PG", color: "#6b8e6b" },
    labels: ["booking-engine", "upsell", "pricing"],
    components: ["bookingtool-frontend", "pricing-service"],
    priority: "Medium",
    createdAt: "2025-11-14T13:45:00Z",
    updatedAt: "2026-03-27T08:00:00Z",
    attachments: [
      { id: "att-6", filename: "vanaf-price-mockup.png", mimeType: "image/png", size: 156000, createdAt: "2025-11-15T09:00:00Z", color: "#d97744", cleaned: false, cleanedAt: null },
      { id: "att-7", filename: "pricing-api-response.json", mimeType: "application/json", size: 3100, createdAt: "2025-11-20T10:00:00Z", color: "#44aabb", cleaned: false, cleanedAt: null },
    ],
    subtasks: [],
    linkedIssues: [
      { relation: "relates to", key: "VPL-37366", title: "Implement age bucket pricing for extras in upsell app and in all receipts", type: "story", jiraStatus: "TO DO", assignee: null },
      { relation: "relates to", key: "VPL-41192", title: "Only show PES when there is a price and availability for the date(s) where the extra is actually booked", type: "story", jiraStatus: "TO DO", assignee: null },
    ],
    jiraComments: [
      { id: "jc-8", authorName: "Pieter Groot", authorAvatar: null, authorInitials: "PG", authorColor: "#6b8e6b", content: "This was discussed in the pricing refinement. We agreed that 'vanaf' is the clearest label for Dutch guests. English locale will use 'from'.", createdAt: "2025-11-18T16:00:00Z" },
    ],
  },
  "VPL-43001": {
    description: `## Objective

Create a comprehensive manual for the **Extras** module, covering configuration, usage, and troubleshooting. This document will serve as the primary reference for hoteliers and internal support staff.

## Chapters

1. **Introduction** - What extras are, how they fit in the booking flow
2. **Configuration** - Step-by-step guide in Daylight PMS
   - Creating an extra
   - Setting pricing (per person, per room, per night)
   - Configuring availability and inventory
   - Linking extras to rate plans
3. **Guest-Facing Behavior** - How extras appear on the booking tool
4. **Receipts & Invoicing** - How extras appear on receipts
5. **Troubleshooting** - Common issues and solutions

## Acceptance Criteria

- [ ] All chapters written and reviewed by PO
- [ ] Screenshots from staging environment included
- [ ] PDF export available for offline use
- [ ] Published on the internal knowledge base
- [ ] Support team briefed on the new documentation`,
    reporter: { name: "Lisa Timmermans", initials: "LT", color: "#c44a7a" },
    labels: ["documentation", "upsell"],
    components: ["docs"],
    priority: "Medium",
    createdAt: "2026-02-28T14:00:00Z",
    updatedAt: "2026-03-30T09:20:00Z",
    attachments: [
      { id: "att-8", filename: "extras-manual-draft-v2.pdf", mimeType: "application/pdf", size: 2400000, createdAt: "2026-03-20T11:00:00Z", color: "#e5534b", cleaned: false, cleanedAt: null },
      { id: "att-9", filename: "extras-config-screenshot.png", mimeType: "image/png", size: 410000, createdAt: "2026-03-22T10:30:00Z", color: "#a05ac8", cleaned: false, cleanedAt: null },
    ],
    subtasks: [
      { key: "VPL-43002", title: "Write chapters 1-3", type: "subtask", jiraStatus: "DONE", assignee: { name: "Lisa Timmermans", initials: "LT", color: "#c44a7a" } },
      { key: "VPL-43003", title: "Write chapters 4-5 and add screenshots", type: "subtask", jiraStatus: "TEST", assignee: { name: "Lisa Timmermans", initials: "LT", color: "#c44a7a" } },
    ],
    linkedIssues: [
      { relation: "relates to", key: "VPL-43566", title: "Upsell: Enable reservations for extra's which have inventory items configured in Daylight PMS", type: "story", jiraStatus: "TO DO", assignee: null },
    ],
    jiraComments: [
      { id: "jc-9", authorName: "Lisa Timmermans", authorAvatar: null, authorInitials: "LT", authorColor: "#c44a7a", content: "Draft v2 is uploaded. Chapters 1-3 are complete with screenshots. Chapters 4-5 still need input on the new receipt format.", createdAt: "2026-03-20T11:05:00Z" },
      { id: "jc-10", authorName: "Pieter Groot", authorAvatar: null, authorInitials: "PG", authorColor: "#6b8e6b", content: "Reviewed chapters 1-3. Looks good, just a few minor wording changes needed. Will send detailed feedback by email.", createdAt: "2026-03-25T09:00:00Z" },
    ],
  },
  "VPL-43900": {
    description: `## Problem

A double-booking occurs when two concurrent reservation requests target the same room for overlapping dates. The current locking mechanism uses optimistic locking on the \`reservation\` table, but the availability check and the insert happen in separate transactions.

## Root Cause Analysis

1. Request A checks availability for Room 101, dates March 15-17 -> available
2. Request B checks availability for Room 101, dates March 16-18 -> available
3. Request A inserts reservation -> success
4. Request B inserts reservation -> success (no conflict detected)

The gap between the availability check (step 1/2) and the insert (step 3/4) is the window where the race condition occurs.

## Proposed Solution

- Use a **pessimistic lock** (SELECT FOR UPDATE) on the room-date combination during the availability check
- Wrap the check + insert in a single transaction
- Add a unique constraint on \`(room_id, date)\` in the \`room_availability\` table as a safety net

## Acceptance Criteria

- [ ] No double bookings possible under concurrent load
- [ ] Load test with 50 concurrent requests for the same room passes
- [ ] Existing reservation flow performance is not degraded by more than 10%
- [ ] Deadlock handling: retry logic for lock timeout scenarios
- [ ] Monitoring: log and alert when lock contention exceeds threshold`,
    reporter: { name: "Jan de Vries", initials: "JV", color: "#5b7fc4" },
    labels: ["bug-fix", "concurrency", "backend"],
    components: ["reservation-service", "room-availability"],
    priority: "High",
    createdAt: "2026-03-18T08:30:00Z",
    updatedAt: "2026-03-29T17:00:00Z",
    attachments: [
      { id: "att-10", filename: "race-condition-sequence.png", mimeType: "image/png", size: 178000, createdAt: "2026-03-18T09:00:00Z", color: "#e5534b", cleaned: false, cleanedAt: null },
    ],
    subtasks: [
      { key: "VPL-43901", title: "Implement pessimistic locking on room-date availability", type: "subtask", jiraStatus: "TO DO", assignee: null },
      { key: "VPL-43902", title: "Add unique constraint on room_availability table", type: "subtask", jiraStatus: "TO DO", assignee: null },
      { key: "VPL-43903", title: "Write concurrent load test", type: "subtask", jiraStatus: "TO DO", assignee: null },
    ],
    linkedIssues: [
      { relation: "blocks", key: "VPL-44062", title: "Confirmation page extra preview does not hide mealplan extras included in rate", type: "bug", jiraStatus: "IN PROGRESS", assignee: { name: "Jan de Vries", initials: "JV", color: "#5b7fc4" } },
    ],
    jiraComments: [
      { id: "jc-11", authorName: "Jan de Vries", authorAvatar: null, authorInitials: "JV", authorColor: "#5b7fc4", content: "I have reproduced the issue on staging. Sending 10 concurrent requests reliably produces 2-3 double bookings. Root cause confirmed as the gap between availability check and insert.", createdAt: "2026-03-19T11:00:00Z" },
      { id: "jc-12", authorName: "Mark Rutte", authorAvatar: null, authorInitials: "MR", authorColor: "#2e9149", content: "We should also consider the impact on the connection pool. SELECT FOR UPDATE holds the connection longer. Let me know if you need help with the load testing.", createdAt: "2026-03-20T14:30:00Z" },
    ],
  },
};
