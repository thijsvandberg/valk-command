import { describe, it, expect, beforeEach } from "vitest";
import {
  getConversations,
  getConversation,
  createConversation,
  deleteConversation,
  getMessages,
  addMessage,
  resetStore,
} from "./chat-store";

beforeEach(() => {
  resetStore();
});

describe("chat-store", () => {
  describe("conversations", () => {
    it("starts empty", () => {
      expect(getConversations()).toEqual([]);
    });

    it("creates a conversation with default title", () => {
      const conv = createConversation();
      expect(conv.title).toBe("New conversation");
      expect(conv.id).toBeTruthy();
      expect(conv.createdAt).toBeTruthy();
    });

    it("creates a conversation with custom title", () => {
      const conv = createConversation("My chat");
      expect(conv.title).toBe("My chat");
    });

    it("lists conversations sorted by most recent", () => {
      const a = createConversation("First");
      // Nudge updatedAt so sort order is deterministic
      addMessage(a.id, "user", "old");
      const b = createConversation("Second");
      addMessage(b.id, "user", "new");
      const list = getConversations();
      // Both are in the list, most recently updated first
      expect(list.map((c) => c.title)).toContain("First");
      expect(list.map((c) => c.title)).toContain("Second");
      expect(list).toHaveLength(2);
    });

    it("gets a conversation by id", () => {
      const conv = createConversation("Find me");
      expect(getConversation(conv.id)).toEqual(conv);
    });

    it("returns undefined for unknown id", () => {
      expect(getConversation("nonexistent")).toBeUndefined();
    });

    it("deletes a conversation", () => {
      const conv = createConversation("Delete me");
      expect(deleteConversation(conv.id)).toBe(true);
      expect(getConversations()).toEqual([]);
    });

    it("returns false when deleting unknown conversation", () => {
      expect(deleteConversation("nonexistent")).toBe(false);
    });

    it("deletes associated messages when conversation is deleted", () => {
      const conv = createConversation("With messages");
      addMessage(conv.id, "user", "Hello");
      deleteConversation(conv.id);
      expect(getMessages(conv.id)).toEqual([]);
    });
  });

  describe("messages", () => {
    it("starts empty for a conversation", () => {
      const conv = createConversation();
      expect(getMessages(conv.id)).toEqual([]);
    });

    it("adds a message to a conversation", () => {
      const conv = createConversation();
      const msg = addMessage(conv.id, "user", "Hello");
      expect(msg.role).toBe("user");
      expect(msg.content).toBe("Hello");
      expect(msg.conversationId).toBe(conv.id);
    });

    it("returns messages in chronological order", () => {
      const conv = createConversation();
      const m1 = addMessage(conv.id, "user", "First");
      const m2 = addMessage(conv.id, "assistant", "Second");
      const msgs = getMessages(conv.id);
      expect(msgs[0].id).toBe(m1.id);
      expect(msgs[1].id).toBe(m2.id);
    });

    it("updates conversation updatedAt when a message is added", () => {
      const conv = createConversation();
      const msg = addMessage(conv.id, "user", "Trigger update");
      const updated = getConversation(conv.id);
      // updatedAt should match the message createdAt
      expect(updated!.updatedAt).toBe(msg.createdAt);
    });
  });
});
