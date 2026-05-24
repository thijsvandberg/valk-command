// @vitest-environment node
import { describe, it, expect } from "vitest";
import { isValidCron } from "./cron";

describe("isValidCron", () => {
  it("accepts valid standard 5-field expressions", () => {
    expect(isValidCron("* * * * *")).toBe(true);
    expect(isValidCron("0 * * * *")).toBe(true);
    expect(isValidCron("0 9 * * 1")).toBe(true);
    expect(isValidCron("*/5 * * * *")).toBe(true);
    expect(isValidCron("0 0 1 1 *")).toBe(true);
    expect(isValidCron("30 6 * * 1-5")).toBe(true);
  });

  it("accepts expressions with step values", () => {
    expect(isValidCron("*/15 */2 * * *")).toBe(true);
    expect(isValidCron("0 9-17 * * 1-5")).toBe(true);
  });

  it("rejects expressions with fewer than 5 fields", () => {
    expect(isValidCron("* * * *")).toBe(false);
    expect(isValidCron("*")).toBe(false);
    expect(isValidCron("")).toBe(false);
  });

  it("rejects expressions with more than 5 fields", () => {
    expect(isValidCron("* * * * * *")).toBe(false);
  });

  it("rejects expressions with invalid characters", () => {
    expect(isValidCron("abc * * * *")).toBe(false);
    expect(isValidCron("@ * * * *")).toBe(false);
    expect(isValidCron("? * * * *")).toBe(false);
  });
});
