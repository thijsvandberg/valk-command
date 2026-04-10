import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth";

describe("auth utilities", () => {
  it("hashes and verifies a password correctly", () => {
    const password = "test-password-123";
    const hash = hashPassword(password);

    expect(hash).toContain(":");
    expect(verifyPassword(password, hash)).toBe(true);
  });

  it("rejects wrong password", () => {
    const hash = hashPassword("correct-password");
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("rejects malformed hash", () => {
    expect(verifyPassword("password", "not-a-valid-hash")).toBe(false);
  });

  it("produces different hashes for same password (unique salt)", () => {
    const hash1 = hashPassword("same-password");
    const hash2 = hashPassword("same-password");
    expect(hash1).not.toBe(hash2);
  });
});
