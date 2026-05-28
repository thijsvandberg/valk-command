import { describe, it, expect } from "vitest";
import {
  extractAuthor,
  normalisePrStatus,
  normaliseBuildState,
  shortRepoName,
  containsExactKey,
  detectEnvironment,
} from "./bitbucket-client";

describe("extractAuthor", () => {
  it("returns display_name from user object", () => {
    expect(extractAuthor(undefined, { display_name: "Jane Doe" })).toBe("Jane Doe");
  });

  it("extracts name from raw email format", () => {
    expect(extractAuthor("Jane Doe <jane@example.com>")).toBe("Jane Doe");
  });

  it("prefers user object over raw", () => {
    expect(extractAuthor("Raw Name <r@x.com>", { display_name: "User Name" })).toBe("User Name");
  });

  it("returns raw string when no angle bracket", () => {
    expect(extractAuthor("just-a-name")).toBe("just-a-name");
  });

  it("returns Unknown when both are missing", () => {
    expect(extractAuthor()).toBe("Unknown");
  });
});

describe("normalisePrStatus", () => {
  it("maps MERGED correctly", () => {
    expect(normalisePrStatus("MERGED")).toBe("MERGED");
    expect(normalisePrStatus("merged")).toBe("MERGED");
  });

  it("maps DECLINED and SUPERSEDED to DECLINED", () => {
    expect(normalisePrStatus("DECLINED")).toBe("DECLINED");
    expect(normalisePrStatus("SUPERSEDED")).toBe("DECLINED");
  });

  it("maps everything else to OPEN", () => {
    expect(normalisePrStatus("OPEN")).toBe("OPEN");
    expect(normalisePrStatus("whatever")).toBe("OPEN");
  });
});

describe("normaliseBuildState", () => {
  it("maps known states correctly", () => {
    expect(normaliseBuildState("SUCCESSFUL")).toBe("SUCCESSFUL");
    expect(normaliseBuildState("FAILED")).toBe("FAILED");
    expect(normaliseBuildState("STOPPED")).toBe("STOPPED");
  });

  it("maps unknown states to IN_PROGRESS", () => {
    expect(normaliseBuildState("PENDING")).toBe("IN_PROGRESS");
    expect(normaliseBuildState("")).toBe("IN_PROGRESS");
  });
});

describe("shortRepoName", () => {
  it("strips valk- prefix", () => {
    expect(shortRepoName("valk-platform")).toBe("platform");
  });

  it("leaves non-prefixed names alone", () => {
    expect(shortRepoName("other-repo")).toBe("other-repo");
  });
});

describe("containsExactKey", () => {
  it("matches exact key in text", () => {
    expect(containsExactKey("feature/VPL-123-login", "VPL-123")).toBe(true);
  });

  it("rejects substring match with trailing digit", () => {
    expect(containsExactKey("feature/VPL-1234-login", "VPL-123")).toBe(false);
  });

  it("matches at end of string", () => {
    expect(containsExactKey("fix/VPL-42", "VPL-42")).toBe(true);
  });

  it("matches when followed by non-digit", () => {
    expect(containsExactKey("VPL-42-some-description", "VPL-42")).toBe(true);
  });
});

describe("detectEnvironment", () => {
  it("detects production", () => {
    const result = detectEnvironment("Deploy to production");
    expect(result).toEqual({ environment: "Production", type: "Production" });
  });

  it("detects UAT variants", () => {
    expect(detectEnvironment("Set build vars to UAT 1")).toEqual({ environment: "UAT1", type: "Staging" });
    expect(detectEnvironment("Deploy UAT2")).toEqual({ environment: "UAT2", type: "Staging" });
    expect(detectEnvironment("UAT 3 deploy")).toEqual({ environment: "UAT3", type: "Staging" });
  });

  it("detects staging", () => {
    expect(detectEnvironment("Deploy to staging")).toEqual({ environment: "Staging", type: "Staging" });
  });

  it("detects test", () => {
    expect(detectEnvironment("Run test suite")).toEqual({ environment: "Test", type: "Test" });
  });

  it("returns null for unrecognized", () => {
    expect(detectEnvironment("Build step")).toBeNull();
  });
});
