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

  it("formats output as [tag] message", () => {
    logger.info("my-tag", "hello world");
    expect(console.log).toHaveBeenCalledWith("[my-tag] hello world");
  });

  it("debug calls console.debug", () => {
    logger.debug("tag", "msg");
    expect(console.debug).toHaveBeenCalledWith("[tag] msg");
  });

  it("info calls console.log", () => {
    logger.info("tag", "msg");
    expect(console.log).toHaveBeenCalledWith("[tag] msg");
  });

  it("warn calls console.warn", () => {
    logger.warn("tag", "msg");
    expect(console.warn).toHaveBeenCalledWith("[tag] msg");
  });

  it("error calls console.error", () => {
    logger.error("tag", "msg");
    expect(console.error).toHaveBeenCalledWith("[tag] msg");
  });

  it("forwards extra args to console method", () => {
    const err = new Error("boom");
    logger.error("tag", "failed", err);
    expect(console.error).toHaveBeenCalledWith("[tag] failed", err);
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
