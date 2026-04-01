export interface StoryVersion {
  versionNumber: number;
  date: string;
  source: "Jira sync" | "Local edit";
  contentHash: string;
  qualityScore: number | null;
  content: string;
}

// Per-ticket version history for tickets that have story changes tracked
export const MOCK_VERSIONS_BY_TICKET: Record<string, StoryVersion[]> = {
  "VPL-44062": [
    {
      versionNumber: 1,
      date: "2026-03-15T10:22:00Z",
      source: "Jira sync",
      contentHash: "a1b2c3d4",
      qualityScore: null,
      content: `## Problem

On the confirmation page, the extra preview section displays mealplan extras that are already included in the selected rate.

## Expected Behavior

- Mealplan extras that are included in the rate should not appear in the upsell preview section
- Only extras that are genuinely optional and purchasable should be displayed

## Acceptance Criteria

- [ ] Extras included in the selected rate are filtered from the upsell preview
- [ ] Unit tests cover the filtering logic`,
    },
    {
      versionNumber: 2,
      date: "2026-03-20T14:05:00Z",
      source: "Jira sync",
      contentHash: "e5f6a7b8",
      qualityScore: 55,
      content: `## Problem

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
- [ ] Unit tests cover the filtering logic`,
    },
    {
      versionNumber: 3,
      date: "2026-03-28T16:45:00Z",
      source: "Jira sync",
      contentHash: "c9d0e1f2",
      qualityScore: 71,
      content: `## Problem

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
    },
  ],
  "VPL-33796": [
    {
      versionNumber: 1,
      date: "2025-11-14T13:45:00Z",
      source: "Jira sync",
      contentHash: "bb1122cc",
      qualityScore: null,
      content: `## User Story

As a guest, I want to see "vanaf" prices when daily prices for an extra are not all equal.

## Acceptance Criteria

- [ ] "vanaf" label appears when daily prices differ
- [ ] Lowest price is shown`,
    },
    {
      versionNumber: 2,
      date: "2026-01-10T10:00:00Z",
      source: "Jira sync",
      contentHash: "dd3344ee",
      qualityScore: 52,
      content: `## User Story

As a guest, I want to see "vanaf" (starting from) prices when the daily prices for an extra are not all equal, so I understand that the displayed price is a minimum and may vary.

## Current Behavior

The extras page shows a single price regardless of whether daily prices differ.

## Desired Behavior

- When all daily prices are equal: show the price normally
- When daily prices differ: prefix with "vanaf"
- The confirmation page always shows the actual total

## Acceptance Criteria

- [ ] "vanaf" label appears when daily prices differ
- [ ] Lowest price among available days is shown
- [ ] Confirmation page shows exact total
- [ ] Works for both per-person and per-room price types`,
    },
    {
      versionNumber: 3,
      date: "2026-03-27T08:00:00Z",
      source: "Local edit",
      contentHash: "ff5566aa",
      qualityScore: 73,
      content: `## User Story

As a guest, I want to see **"vanaf" (starting from) prices** when the daily prices for an extra are not all equal, so I understand that the displayed price is a minimum and may vary.

## Current Behavior

The extras page shows a single price regardless of whether daily prices differ. Guests see e.g. "5.00 per person per night" even when some nights cost 7.50.

## Desired Behavior

- When all daily prices are equal: show the price normally (e.g. "5.00 per person per night")
- When daily prices differ: prefix with "vanaf" (e.g. "vanaf 5.00 per person per night")
- The confirmation page always shows the **actual total**, never the "vanaf" price

## Acceptance Criteria

- [ ] "vanaf" label appears when daily prices differ
- [ ] Lowest price among available days is shown
- [ ] Confirmation page shows exact total
- [ ] Works for both per-person and per-room price types
- [ ] Unit tests for price comparison logic`,
    },
  ],
  "VPL-43900": [
    {
      versionNumber: 1,
      date: "2026-03-18T08:30:00Z",
      source: "Jira sync",
      contentHash: "aa9900bb",
      qualityScore: null,
      content: `## Problem

A double-booking occurs when two concurrent reservation requests target the same room.

## Proposed Solution

- Use pessimistic locking on the room-date combination
- Add a unique constraint as a safety net`,
    },
    {
      versionNumber: 2,
      date: "2026-03-29T17:00:00Z",
      source: "Jira sync",
      contentHash: "cc1122dd",
      qualityScore: 35,
      content: `## Problem

A double-booking occurs when two concurrent reservation requests target the same room for overlapping dates. The current locking mechanism uses optimistic locking on the reservation table, but the availability check and the insert happen in separate transactions.

## Root Cause Analysis

1. Request A checks availability for Room 101, dates March 15-17 -> available
2. Request B checks availability for Room 101, dates March 16-18 -> available
3. Request A inserts reservation -> success
4. Request B inserts reservation -> success (no conflict detected)

## Proposed Solution

- Use a **pessimistic lock** (SELECT FOR UPDATE) on the room-date combination
- Wrap the check + insert in a single transaction
- Add a unique constraint on \`(room_id, date)\` in the \`room_availability\` table

## Acceptance Criteria

- [ ] No double bookings possible under concurrent load
- [ ] Load test with 50 concurrent requests passes
- [ ] Deadlock handling: retry logic for lock timeout scenarios`,
    },
  ],
};

// Default versions used when no per-ticket mapping exists (kept for backward compat)
export const MOCK_VERSIONS: StoryVersion[] = [
  {
    versionNumber: 1,
    date: "2026-03-15T10:22:00Z",
    source: "Jira sync",
    contentHash: "a1b2c3d4",
    qualityScore: null,
    content: `## User Story

As a guest, I want to see correct extra prices on the booking page, so that I know what I will pay.

## Acceptance Criteria

1. Show extra prices on the extras selection page
2. Prices should come from the daily prices API
3. When prices differ between days, show the lowest price
4. Hide extras that have no price configured

## Technical Notes

- Use the existing daily-prices endpoint
- Prices are per person per night`,
  },
  {
    versionNumber: 2,
    date: "2026-03-20T14:05:00Z",
    source: "Jira sync",
    contentHash: "e5f6a7b8",
    qualityScore: 45,
    content: `## User Story

As a guest, I want to see correct extra prices on the booking page, even when prices vary between dates, so that I know what I will pay and am not surprised at checkout.

## Acceptance Criteria

1. Show extra prices on the extras selection page
2. Prices should come from the daily prices API
3. When prices differ between days, show the lowest price with a "vanaf" label
4. Hide extras that have no price configured
5. Show "per person per night" or "per night" based on the price type

## Technical Notes

- Use the existing daily-prices endpoint
- Prices are per person per night or per room per night depending on configuration
- The "vanaf" label indicates the guest may pay more on certain dates`,
  },
  {
    versionNumber: 3,
    date: "2026-03-25T09:30:00Z",
    source: "Local edit",
    contentHash: "c9d0e1f2",
    qualityScore: 65,
    content: `## User Story

As a guest, I want to see correct extra prices on the booking page, even when prices vary between dates, so that I know what I will pay and am not surprised at checkout.

## Acceptance Criteria

1. Show extra prices on the extras selection page for all available extras
2. Prices must come from the daily prices API (not cached hotel-service prices)
3. When not all daily prices are equal, show the lowest adult price with a "vanaf" label
4. Only show extras that have both a price and available inventory for the selected dates
5. Show "per person per night" or "per night" based on the price type
6. The confirmation page must show the actual calculated total, not the "vanaf" price

## Scenarios

**Scenario A: Equal prices across all dates**
- Guest selects 3-night stay, extra costs 5.00/night each day
- Display: "5.00 per person per night" (no "vanaf" label)

**Scenario B: Varying prices across dates**
- Guest selects 3-night stay, extra costs 5.00, 7.50, 5.00 on respective days
- Display: "vanaf 5.00 per person per night"
- Confirmation page shows total: 17.50

## Technical Notes

- Use the existing daily-prices endpoint
- Prices are per person per night or per room per night depending on configuration
- The "vanaf" label indicates the guest may pay more on certain dates
- Inventory check must happen per date, not just globally`,
  },
  {
    versionNumber: 4,
    date: "2026-03-28T16:45:00Z",
    source: "Jira sync",
    contentHash: "a3b4c5d6",
    qualityScore: 73,
    content: `## User Story

As a guest, I want to see correct extra prices on the booking page, even when prices vary between dates, so that I can make an informed booking decision and am not surprised at checkout.

## Acceptance Criteria

1. Show extra prices on the extras selection page for all available extras
2. Prices must come from the daily prices API (not cached hotel-service prices)
3. When not all daily prices are equal, show the lowest adult price among days with available inventory, prefixed with a "vanaf" label
4. Only show extras that have both a price and available inventory for the selected dates
5. Show "per person per night" or "per night" based on the price type
6. The confirmation page must show the actual calculated total, not the "vanaf" price
7. Age bucket pricing: use the adult price bracket for the "vanaf" display; child/infant brackets are shown separately when expanded

## Scenarios

**Scenario A: Equal prices across all dates**
- Guest selects 3-night stay, extra costs 5.00/night each day
- Display: "5.00 per person per night" (no "vanaf" label)

**Scenario B: Varying prices across dates**
- Guest selects 3-night stay, extra costs 5.00, 7.50, 5.00 on respective days
- Display: "vanaf 5.00 per person per night"
- Confirmation page shows total: 17.50 per person

**Scenario C: Partial inventory availability**
- Guest selects 3-night stay, extra available on day 1 and 3 only
- Display: "vanaf 5.00 per person per night" (based on available days only)
- Extra is bookable but only applied to days with inventory

## Technical Notes

- Use the existing daily-prices endpoint from the pricing service
- Prices are per person per night or per room per night depending on configuration
- The "vanaf" label indicates the guest may pay more on certain dates
- Inventory check must happen per date, not just globally
- Mealplan extras included in the rate should be excluded from the upsell display`,
  },
];
