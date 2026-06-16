import { describe, it, expect } from "vitest";
import { resolveReporter, resolveAssignee, samePerson, type PersonRef } from "./person-ref";

const reporterRow = {
  reporter: "Thijs van den Berg",
  reporterAccountId: "acc-1",
  reporterAvatar: "https://example.com/thijs.png",
  reporterEmail: "thijs@newstory.nl",
};

const assigneeRow = {
  assignee: "Robin",
  assigneeAccountId: "acc-2",
  assigneeAvatar: "https://example.com/robin.png",
  assigneeEmail: "robin@newstory.nl",
};

describe("resolveReporter", () => {
  it("returns the stable id + label from stored columns", () => {
    expect(resolveReporter(reporterRow)).toEqual({
      accountId: "acc-1",
      displayName: "Thijs van den Berg",
      email: "thijs@newstory.nl",
      avatar: "https://example.com/thijs.png",
    });
  });

  it("returns null when the row carries no reporter at all", () => {
    expect(
      resolveReporter({ reporter: null, reporterAccountId: null, reporterAvatar: null, reporterEmail: null }),
    ).toBeNull();
  });

  it("resolves a legacy row that only has a display name", () => {
    const ref = resolveReporter({ reporter: "Legacy Name", reporterAccountId: null, reporterAvatar: null, reporterEmail: null });
    expect(ref).toEqual({ accountId: null, displayName: "Legacy Name", email: null, avatar: null });
  });

  it("prefers the jira_user directory label over the ticket's cached name", () => {
    const lookup = (id: string) =>
      id === "acc-1" ? { displayName: "Thijs (renamed)", email: "new@newstory.nl", avatar: "new.png" } : undefined;
    const ref = resolveReporter(reporterRow, lookup);
    expect(ref).toEqual({ accountId: "acc-1", displayName: "Thijs (renamed)", email: "new@newstory.nl", avatar: "new.png" });
  });

  it("falls back to the ticket's cached name when the accountId is unknown to the directory", () => {
    const lookup = () => undefined;
    const ref = resolveReporter(reporterRow, lookup);
    expect(ref?.displayName).toBe("Thijs van den Berg");
    expect(ref?.avatar).toBe("https://example.com/thijs.png");
  });

  it("does not blank a label when the row has no accountId even with a lookup", () => {
    const lookup = () => ({ displayName: "Should not be used", email: null, avatar: null });
    const ref = resolveReporter(
      { reporter: "Legacy Name", reporterAccountId: null, reporterAvatar: null, reporterEmail: null },
      lookup,
    );
    expect(ref?.displayName).toBe("Legacy Name");
  });
});

describe("resolveAssignee", () => {
  it("returns the stable id + label from stored columns", () => {
    expect(resolveAssignee(assigneeRow)).toEqual({
      accountId: "acc-2",
      displayName: "Robin",
      email: "robin@newstory.nl",
      avatar: "https://example.com/robin.png",
    });
  });

  it("returns null when the row carries no assignee", () => {
    expect(
      resolveAssignee({ assignee: null, assigneeAccountId: null, assigneeAvatar: null, assigneeEmail: null }),
    ).toBeNull();
  });
});

describe("samePerson", () => {
  const base: PersonRef = { accountId: "acc-1", displayName: "Thijs van den Berg", email: "thijs@newstory.nl", avatar: null };

  it("matches on accountId even when the display name changed (rename scenario)", () => {
    const renamed: PersonRef = { accountId: "acc-1", displayName: "Thijs vd Berg", email: null, avatar: null };
    expect(samePerson(base, renamed)).toBe(true);
  });

  it("does not match when accountIds differ even if names are identical", () => {
    const namesake: PersonRef = { accountId: "acc-9", displayName: "Thijs van den Berg", email: null, avatar: null };
    expect(samePerson(base, namesake)).toBe(false);
  });

  it("falls back to email (case-insensitive) when an accountId is missing", () => {
    const a: PersonRef = { accountId: null, displayName: "T", email: "Thijs@NewStory.nl", avatar: null };
    const b: PersonRef = { accountId: null, displayName: "Different", email: "thijs@newstory.nl", avatar: null };
    expect(samePerson(a, b)).toBe(true);
  });

  it("falls back to display name when neither accountId nor email is present", () => {
    const a: PersonRef = { accountId: null, displayName: "Thijs van den Berg", email: null, avatar: null };
    const b: PersonRef = { accountId: null, displayName: "Thijs van den Berg", email: null, avatar: null };
    expect(samePerson(a, b)).toBe(true);
  });

  it("returns false for null inputs", () => {
    expect(samePerson(null, base)).toBe(false);
    expect(samePerson(base, undefined)).toBe(false);
  });
});
