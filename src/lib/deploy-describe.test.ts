import { describe, it, expect } from "vitest";
import { describeDeploy } from "./deploy-describe";

describe("describeDeploy", () => {
  it("phrases a successful deploy as a sentence with a relative 'xx ago' suffix", () => {
    const r = describeDeploy({ environment: "UAT3", state: "SUCCESSFUL", completedAt: "2026-06-25T13:58:00.000Z" });
    expect(r).toMatch(/^Last deployed to UAT3 successfully on .+ \(.+ ago\)\.$/);
    expect(r).not.toContain("SUCCESSFUL");
  });

  it("phrases a failed deploy as a sentence with a relative 'xx ago' suffix", () => {
    const r = describeDeploy({ environment: "UAT3", state: "FAILED", completedAt: "2026-06-25T13:58:00.000Z" });
    expect(r).toMatch(/^The last deploy to UAT3 failed on .+ \(.+ ago\)\.$/);
  });

  it("phrases an in-progress deploy readably and drops the date when missing", () => {
    const r = describeDeploy({ environment: "UAT3", state: "INPROGRESS", completedAt: null });
    expect(r).toBe("Deploy to UAT3 is in progress.");
  });
});
