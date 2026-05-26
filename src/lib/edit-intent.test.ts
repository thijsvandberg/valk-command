import { describe, it, expect } from "vitest";
import { hasEditIntent } from "./edit-intent";

describe("hasEditIntent", () => {
  describe("English edit keywords", () => {
    const cases = [
      "improve the acceptance criteria",
      "add a section about error handling",
      "change the title to something better",
      "rewrite the description",
      "update the story draft",
      "remove the second paragraph",
      "fix the typo in line 3",
      "shorten the description",
      "expand on the technical details",
      "rephrase the first section",
      "include more context about the API",
      "restructure the acceptance criteria",
      "elaborate on the edge cases",
      "rename the user role field",
      "replace the intro paragraph",
      "edit the scope section",
    ];

    for (const msg of cases) {
      it(`"${msg}" -> true`, () => {
        expect(hasEditIntent(msg)).toBe(true);
      });
    }
  });

  describe("Dutch edit keywords", () => {
    const cases = [
      "verbeter de beschrijving",
      "voeg toe een sectie over foutafhandeling",
      "verwijder de tweede paragraaf",
      "pas aan de acceptatiecriteria",
      "herschrijf de titel",
      "verkort de samenvatting",
      "hernoem het veld",
      "vervang de intro",
      "bewerk de scope",
    ];

    for (const msg of cases) {
      it(`"${msg}" -> true`, () => {
        expect(hasEditIntent(msg)).toBe(true);
      });
    }
  });

  describe("simple English questions", () => {
    const cases = [
      "what is the ticket key?",
      "how many story points?",
      "when was this created?",
      "where is this deployed?",
      "which sprint is this in?",
      "who is the assignee?",
      "why was this blocked?",
      "is this blocked?",
      "are there subtasks?",
      "can you explain this?",
      "could you summarize?",
      "does it have a parent?",
      "how much effort?",
    ];

    for (const msg of cases) {
      it(`"${msg}" -> false`, () => {
        expect(hasEditIntent(msg)).toBe(false);
      });
    }
  });

  describe("simple Dutch questions", () => {
    const cases = [
      "wat is de story nr",
      "hoe heet de epic?",
      "wanneer is de deadline?",
      "waar staat dit ticket?",
      "hoeveel story points?",
      "wie is de eigenaar?",
      "waarom is dit geblokkeerd?",
    ];

    for (const msg of cases) {
      it(`"${msg}" -> false`, () => {
        expect(hasEditIntent(msg)).toBe(false);
      });
    }
  });

  it("returns false for short messages ending with ?", () => {
    expect(hasEditIntent("status?")).toBe(false);
    expect(hasEditIntent("ready?")).toBe(false);
    expect(hasEditIntent("priority?")).toBe(false);
  });

  it("is case insensitive for keywords", () => {
    expect(hasEditIntent("IMPROVE the story")).toBe(true);
    expect(hasEditIntent("Rewrite everything")).toBe(true);
    expect(hasEditIntent("ADD more details")).toBe(true);
  });

  it("returns true when splitMode is on regardless of content", () => {
    expect(hasEditIntent("wat is de story nr?", { splitMode: true })).toBe(true);
    expect(hasEditIntent("what is the key?", { splitMode: true })).toBe(true);
    expect(hasEditIntent("status?", { splitMode: true })).toBe(true);
  });

  it("defaults to true for ambiguous non-question messages", () => {
    expect(hasEditIntent("make it better")).toBe(true);
    expect(hasEditIntent("the intro section")).toBe(true);
    expect(hasEditIntent("looks good overall")).toBe(true);
  });

  it("detects multi-word keywords", () => {
    expect(hasEditIntent("update the acceptance criteria please")).toBe(true);
    expect(hasEditIntent("revisit the story draft")).toBe(true);
    expect(hasEditIntent("voeg toe meer context")).toBe(true);
    expect(hasEditIntent("pas aan de structuur")).toBe(true);
  });

  it("does not match keywords inside other words", () => {
    // "add" should match as a whole word, not inside "padding"
    expect(hasEditIntent("what about padding?")).toBe(false);
  });
});
