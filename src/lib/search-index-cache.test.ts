import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getSearchCache,
  setSearchCache,
  invalidateSearchCache,
  type SearchDoc,
  type ConversationSearchDoc,
  type CommentSearchDoc,
} from "./search-index-cache";

function makeDocs(count: number): SearchDoc[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `BRDG-${i}`,
    summary: `Ticket ${i}`,
    status: "TO DO",
    priority: null,
    assignee: null,
    reporter: null,
    sprintName: null,
    labels: "",
    description: "",
    acceptanceCriteria: "",
    localEditTitle: "",
    localEditDescription: "",
    notes: "",
    tags: "",
    jiraCommentBodies: "",
    poCommentBodies: "",
  }));
}

describe("search-index-cache", () => {
  beforeEach(() => {
    invalidateSearchCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when cache is empty", () => {
    expect(getSearchCache()).toBeNull();
  });

  it("stores and retrieves cache", () => {
    const docs = makeDocs(2);
    const entry = setSearchCache(
      docs,
      new Map(),
      new Map(),
      "https://jira.example.com",
      [],
      [],
    );
    expect(entry.docs).toEqual(docs);

    const cached = getSearchCache();
    expect(cached).not.toBeNull();
    expect(cached!.docs).toHaveLength(2);
  });

  it("invalidates cache", () => {
    setSearchCache(makeDocs(1), new Map(), new Map(), "", [], []);
    expect(getSearchCache()).not.toBeNull();
    invalidateSearchCache();
    expect(getSearchCache()).toBeNull();
  });

  it("expires cache after TTL", () => {
    vi.useFakeTimers();
    setSearchCache(makeDocs(1), new Map(), new Map(), "", [], []);
    expect(getSearchCache()).not.toBeNull();

    vi.advanceTimersByTime(61_000);
    expect(getSearchCache()).toBeNull();
  });

  it("cache includes fuse instances for searching", () => {
    const entry = setSearchCache(
      makeDocs(3),
      new Map(),
      new Map(),
      "https://jira.example.com",
      [],
      [],
    );
    expect(entry.fuse).toBeDefined();
    expect(entry.conversationFuse).toBeDefined();
    expect(entry.commentFuse).toBeDefined();
  });
});
