import { describe, it, expect } from "vitest";
import { KEYBOARD_SHORTCUTS } from "./keyboard-shortcuts";

describe("KEYBOARD_SHORTCUTS", () => {
  it("is a non-empty array of shortcut groups", () => {
    expect(KEYBOARD_SHORTCUTS.length).toBeGreaterThan(0);
  });

  it("every group has a scope and non-empty shortcuts array", () => {
    for (const group of KEYBOARD_SHORTCUTS) {
      expect(group.scope).toBeTruthy();
      expect(group.shortcuts.length).toBeGreaterThan(0);
    }
  });

  it("every shortcut has keys and an action", () => {
    for (const group of KEYBOARD_SHORTCUTS) {
      for (const shortcut of group.shortcuts) {
        expect(shortcut.keys.length).toBeGreaterThan(0);
        expect(shortcut.action).toBeTruthy();
      }
    }
  });
});
