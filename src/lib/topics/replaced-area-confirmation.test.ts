import { describe, it, expect } from "vitest";
import {
  buildConfirmationPrompt,
  parseConfirmation,
} from "./replaced-area-confirmation";

describe("buildConfirmationPrompt", () => {
  it("includes the ticket key, title, and matched areas, and the strict response contract", () => {
    const prompt = buildConfirmationPrompt({
      jiraKey: "BT-100",
      title: "Retire CWI dashboards",
      description: "Old reporting stack.",
      matchedAreas: ["CWI", "RezExchange"],
    });
    expect(prompt).toContain("BT-100");
    expect(prompt).toContain("Retire CWI dashboards");
    expect(prompt).toContain("CWI, RezExchange");
    expect(prompt).toContain("VERDICT:");
    expect(prompt).toContain("RATIONALE:");
  });

  it("handles a null description", () => {
    const prompt = buildConfirmationPrompt({
      jiraKey: "BT-1",
      title: "x",
      description: null,
      matchedAreas: ["CWI"],
    });
    expect(prompt).toContain("(none)");
  });
});

describe("parseConfirmation", () => {
  it("parses a YES verdict and rationale", () => {
    const out = parseConfirmation(
      "VERDICT: YES\nRATIONALE: About RezExchange, which has been replaced.",
    );
    expect(out.confirmed).toBe(true);
    expect(out.rationale).toBe("About RezExchange, which has been replaced.");
  });

  it("parses a NO verdict and rationale", () => {
    const out = parseConfirmation(
      "VERDICT: NO\nRATIONALE: CWI is only mentioned incidentally.",
    );
    expect(out.confirmed).toBe(false);
    expect(out.rationale).toBe("CWI is only mentioned incidentally.");
  });

  it("is tolerant of case, whitespace, and markdown wrapping", () => {
    const out = parseConfirmation("  verdict:  yes \n  RATIONALE:  **Clearly about IDPMS.**  ");
    expect(out.confirmed).toBe(true);
    expect(out.rationale).toBe("Clearly about IDPMS.");
  });

  it("treats an unparseable verdict as NOT confirmed with a default rationale", () => {
    const out = parseConfirmation("I think this is probably about a retired area.");
    expect(out.confirmed).toBe(false);
    expect(out.rationale).toMatch(/incidental/i);
  });

  it("clamps an overly long rationale to 140 characters", () => {
    const long = "x".repeat(300);
    const out = parseConfirmation(`VERDICT: YES\nRATIONALE: ${long}`);
    expect(out.rationale.length).toBe(140);
  });
});
