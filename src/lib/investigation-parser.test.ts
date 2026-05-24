// @vitest-environment node
import { describe, it, expect } from "vitest";
import { isInvestigationResult, parseInvestigationResult, extractInvestigationTitle } from "./investigation-parser";

const BASIC_RESULT = `## Question
When do we show the cancellation button on the booking detail page?

## Finding
The cancellation button is shown when the booking status is "confirmed" and the departure date is more than 48 hours away.

## How it works
1. \`BookingDetail\` component checks \`booking.status === "confirmed"\`
2. \`CancellationPolicy.isWithinWindow()\` in \`apps/api/src/policies/cancellation.go\` returns true when departure > 48h
3. The button calls \`POST /api/bookings/:id/cancel\`

## Key files
| File | Purpose |
|------|---------|
| \`apps/web/src/pages/BookingDetail.tsx\` | Renders the cancellation button |
| \`apps/api/src/policies/cancellation.go\` | Cancellation window logic |`;

const FULL_RESULT_WITH_EXPLAIN = `## Question
How does the upgrade service determine available room types?

## Finding
The upgrade service queries the inventory API for rooms with higher rate codes than the current booking, filtering by availability on the same dates.

## How it works
1. \`UpgradeService.findOptions()\` in \`apps/api/src/services/upgrade.go\` gets the current booking rate code
2. It calls \`InventoryAPI.getAvailable(dates, minRateCode)\` to find higher-tier rooms
3. Results are filtered by \`RoomTypePolicy.isUpgradeEligible()\` which checks loyalty tier

## What's missing
There is no handling for split-stay bookings where dates span different availability windows.

## What would be needed
A date-range splitter that queries inventory per sub-range and merges results.

## Related stories
| Key | Summary | Relevance |
|-----|---------|-----------|
| VPL-12345 | Room upgrade flow | Built the original feature |
| VPL-12400 | Inventory API v2 | Changed the availability endpoint |

## Key files
| File | Purpose |
|------|---------|
| \`apps/api/src/services/upgrade.go\` | Main upgrade logic |
| \`apps/api/src/clients/inventory.go\` | Inventory API client |
| \`apps/web/src/components/UpgradeModal.tsx\` | Frontend upgrade UI |

---

## Summary (non-technical)

**Room Upgrade Availability**

The system finds upgrade options by looking at which higher-tier rooms are available for the same travel dates. It checks the guest's loyalty level to determine which upgrades they qualify for. Currently, it doesn't handle bookings that span multiple date ranges with different availability.`;

const NOT_INVESTIGATION = `# Regular Chat Message

This is just a normal response from the assistant. It has some markdown but no investigation structure.

## Some heading
Some content here.`;

describe("isInvestigationResult", () => {
  it("returns true for content with Question and Finding headings", () => {
    expect(isInvestigationResult(BASIC_RESULT)).toBe(true);
  });

  it("returns true for full result with explain mode", () => {
    expect(isInvestigationResult(FULL_RESULT_WITH_EXPLAIN)).toBe(true);
  });

  it("returns false for non-investigation content", () => {
    expect(isInvestigationResult(NOT_INVESTIGATION)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isInvestigationResult("")).toBe(false);
  });
});

describe("parseInvestigationResult", () => {
  it("returns null for non-investigation content", () => {
    expect(parseInvestigationResult(NOT_INVESTIGATION)).toBeNull();
    expect(parseInvestigationResult("")).toBeNull();
    expect(parseInvestigationResult("Hello world")).toBeNull();
  });

  it("parses a basic investigation result", () => {
    const result = parseInvestigationResult(BASIC_RESULT);
    expect(result).not.toBeNull();

    expect(result!.question).toContain("cancellation button");
    expect(result!.finding).toContain("confirmed");
    expect(result!.howItWorks).toContain("BookingDetail");
    expect(result!.whatsMissing).toBeNull();
    expect(result!.whatWouldBeNeeded).toBeNull();
    expect(result!.relatedStories).toEqual([]);
    expect(result!.stakeholderSummary).toBeNull();

    expect(result!.keyFiles).toHaveLength(2);
    expect(result!.keyFiles[0].file).toBe("apps/web/src/pages/BookingDetail.tsx");
    expect(result!.keyFiles[0].purpose).toBe("Renders the cancellation button");
  });

  it("parses a full result with explain mode", () => {
    const result = parseInvestigationResult(FULL_RESULT_WITH_EXPLAIN);
    expect(result).not.toBeNull();

    expect(result!.question).toContain("upgrade service");
    expect(result!.finding).toContain("inventory API");
    expect(result!.howItWorks).toContain("UpgradeService.findOptions()");
    expect(result!.whatsMissing).toContain("split-stay bookings");
    expect(result!.whatWouldBeNeeded).toContain("date-range splitter");

    expect(result!.relatedStories).toHaveLength(2);
    expect(result!.relatedStories[0]).toEqual({
      key: "VPL-12345",
      summary: "Room upgrade flow",
      relevance: "Built the original feature",
    });
    expect(result!.relatedStories[1].key).toBe("VPL-12400");

    expect(result!.keyFiles).toHaveLength(3);

    expect(result!.stakeholderSummary).toContain("Room Upgrade Availability");
    expect(result!.stakeholderSummary).toContain("loyalty level");
  });

  it("sets isLong based on content length", () => {
    const short = parseInvestigationResult(BASIC_RESULT);
    expect(short!.isLong).toBe(false);

    const long = parseInvestigationResult(FULL_RESULT_WITH_EXPLAIN);
    expect(long!.isLong).toBe(true);
  });

  it("handles result with only some optional sections", () => {
    const partial = `## Question
Test question

## Finding
Test finding

## How it works
Step 1
Step 2`;

    const result = parseInvestigationResult(partial);
    expect(result).not.toBeNull();
    expect(result!.question).toBe("Test question");
    expect(result!.finding).toBe("Test finding");
    expect(result!.howItWorks).toBe("Step 1\nStep 2");
    expect(result!.whatsMissing).toBeNull();
    expect(result!.relatedStories).toEqual([]);
    expect(result!.keyFiles).toEqual([]);
    expect(result!.stakeholderSummary).toBeNull();
  });
});

describe("extractInvestigationTitle", () => {
  it("extracts a short title from the question", () => {
    const title = extractInvestigationTitle(BASIC_RESULT);
    expect(title).not.toBeNull();
    expect(title!.length).toBeLessThanOrEqual(60);
    expect(title!).toContain("cancellation button");
  });

  it("truncates long questions at word boundary", () => {
    const long = `## Question
How does the very complex upgrade service determine the available room types for loyalty program members in the booking flow

## Finding
Test finding`;
    const title = extractInvestigationTitle(long);
    expect(title).not.toBeNull();
    expect(title!.length).toBeLessThanOrEqual(60);
    expect(title!.endsWith("...")).toBe(true);
  });

  it("returns null for non-investigation content", () => {
    expect(extractInvestigationTitle("no investigation here")).toBeNull();
  });
});
