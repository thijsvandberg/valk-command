// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// logger reads process.env at module init; use _setLevel to control level in tests
import { logger, _setLevel } from "./logger";

describe("logger", () => {
  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Reset to debug so all methods are active
    _setLevel("debug");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Lines are prefixed with a local "YYYY-MM-DD HH:MM:SS" timestamp.
  const TS = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} /;

  it("prefixes a timestamp before [tag] message", () => {
    logger.info("my-tag", "hello world");
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \[my-tag\] hello world$/),
    );
  });

  it("debug calls console.debug", () => {
    logger.debug("tag", "msg");
    expect(console.debug).toHaveBeenCalledWith(expect.stringMatching(/^.* \[tag\] msg$/));
    expect((console.debug as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(TS);
  });

  it("info calls console.log", () => {
    logger.info("tag", "msg");
    expect((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(TS);
  });

  it("warn calls console.warn", () => {
    logger.warn("tag", "msg");
    expect((console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(TS);
  });

  it("error calls console.error", () => {
    logger.error("tag", "msg");
    expect((console.error as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(TS);
  });

  it("forwards extra args to console method", () => {
    const err = new Error("boom");
    logger.error("tag", "failed", err);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/^.* \[tag\] failed$/),
      err,
    );
  });

  it("suppresses debug when level is info", () => {
    _setLevel("info");
    logger.debug("tag", "msg");
    expect(console.debug).not.toHaveBeenCalled();
  });

  it("suppresses info and warn when level is error", () => {
    _setLevel("error");
    logger.info("tag", "msg");
    logger.warn("tag", "msg");
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("allows error when level is error", () => {
    _setLevel("error");
    logger.error("tag", "msg");
    expect(console.error).toHaveBeenCalled();
  });

  it("allows warn when level is warn", () => {
    _setLevel("warn");
    logger.warn("tag", "msg");
    expect(console.warn).toHaveBeenCalled();
    logger.info("tag", "msg");
    expect(console.log).not.toHaveBeenCalled();
  });
});
