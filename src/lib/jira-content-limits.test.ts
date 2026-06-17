import { describe, it, expect } from "vitest";
import {
  describeDescriptionSize,
  JIRA_DESCRIPTION_LIMIT,
  NEAR_LIMIT_RATIO,
} from "./jira-content-limits";

describe("describeDescriptionSize", () => {
  const nearThreshold = Math.ceil(JIRA_DESCRIPTION_LIMIT * NEAR_LIMIT_RATIO);

  it("is hidden when comfortably under the limit", () => {
    expect(describeDescriptionSize(0)).toEqual({ state: "hidden", over: 0 });
    expect(describeDescriptionSize(nearThreshold - 1)).toEqual({ state: "hidden", over: 0 });
  });

  it("is near once content reaches the near-limit ratio", () => {
    expect(describeDescriptionSize(nearThreshold).state).toBe("near");
    expect(describeDescriptionSize(JIRA_DESCRIPTION_LIMIT)).toEqual({ state: "near", over: 0 });
  });

  it("is over once content exceeds the limit, reporting the delta", () => {
    expect(describeDescriptionSize(JIRA_DESCRIPTION_LIMIT + 1)).toEqual({ state: "over", over: 1 });
    expect(describeDescriptionSize(JIRA_DESCRIPTION_LIMIT + 1240)).toEqual({ state: "over", over: 1240 });
  });
});
