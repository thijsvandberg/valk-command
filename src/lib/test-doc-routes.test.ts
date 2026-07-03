import { describe, expect, it } from "vitest";
import { guardTestDocDraftKey } from "./test-doc-routes";

describe("guardTestDocDraftKey", () => {
  it("returns null for a real Jira key", () => {
    expect(guardTestDocDraftKey("VPL-1337", "save")).toBeNull();
  });

  it("409s for a draft key with a verb-specific message", async () => {
    const res = guardTestDocDraftKey("DRAFT-abc", "generate");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(409);
    const body = await res!.json();
    expect(body.error).toBe("Cannot generate test documentation for a draft ticket");
  });

  it("uses the passed verb in the message", async () => {
    const cache = await guardTestDocDraftKey("DRAFT-x", "cache")!.json();
    expect(cache.error).toBe("Cannot cache test documentation for a draft ticket");
  });
});
