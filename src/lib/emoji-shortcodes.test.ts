// @vitest-environment node
import { describe, it, expect } from "vitest";
import { resolveEmoji, expandEmojiShortcodes, EMOJI_MAP } from "./emoji-shortcodes";

describe("resolveEmoji", () => {
  it("resolves a known shortcode", () => {
    expect(resolveEmoji("fire")).toBe(EMOJI_MAP.fire);
    expect(resolveEmoji("rocket")).toBe(EMOJI_MAP.rocket);
  });

  it("strips surrounding colons", () => {
    expect(resolveEmoji(":fire:")).toBe(EMOJI_MAP.fire);
    expect(resolveEmoji(":tada:")).toBe(EMOJI_MAP.tada);
  });

  it("returns the original string for unknown shortcodes", () => {
    expect(resolveEmoji("unknown_emoji")).toBe("unknown_emoji");
  });
});

describe("expandEmojiShortcodes", () => {
  it("replaces shortcodes in text with emoji", () => {
    const result = expandEmojiShortcodes("Hello :fire: world :rocket:");
    expect(result).toContain(EMOJI_MAP.fire);
    expect(result).toContain(EMOJI_MAP.rocket);
    expect(result).not.toContain(":fire:");
  });

  it("leaves unknown shortcodes unchanged", () => {
    const input = "Hello :unknown_thing: world";
    expect(expandEmojiShortcodes(input)).toBe(input);
  });

  it("handles text without shortcodes", () => {
    const input = "No emojis here";
    expect(expandEmojiShortcodes(input)).toBe(input);
  });

  it("handles adjacent shortcodes", () => {
    const result = expandEmojiShortcodes(":+1::heart:");
    expect(result).toContain(EMOJI_MAP["+1"]);
    expect(result).toContain(EMOJI_MAP.heart);
  });

  it("handles empty string", () => {
    expect(expandEmojiShortcodes("")).toBe("");
  });
});
