// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { reportClientError, _resetClientErrorThrottle } from "./client-error";

const ENDPOINT = "/api/client-error";

// jsdom's Blob.text() is async, so to read the sendBeacon body synchronously the
// tests subclass Blob and capture the stringified part passed to the constructor.
function captureBlobBody(): { read: () => string } {
  let captured = "";
  const realBlob = globalThis.Blob;
  vi.stubGlobal(
    "Blob",
    class extends realBlob {
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        captured = String(parts[0]);
      }
    },
  );
  return { read: () => captured };
}

describe("reportClientError", () => {
  beforeEach(() => {
    _resetClientErrorThrottle();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("prefers navigator.sendBeacon", () => {
    const beacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    reportClientError("ctx", new Error("boom"));

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe(ENDPOINT);
    // No fetch when the beacon was accepted.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the bounded payload with the context-prefixed message", () => {
    const beacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    const body = captureBlobBody();

    reportClientError("save-story", new Error("disk full"), { digest: "deadbeef" });

    const payload = JSON.parse(body.read()) as Record<string, unknown>;
    expect(payload.message).toBe("[save-story] disk full");
    expect(payload.stack).toBeTypeOf("string");
    expect(payload.digest).toBe("deadbeef");
    // jsdom default pathname is "/"
    expect(payload.pathname).toBe("/");
    expect(payload.userAgent).toBeTypeOf("string");
  });

  it("falls back to fetch with keepalive when sendBeacon is unavailable", () => {
    Object.defineProperty(navigator, "sendBeacon", { value: undefined, configurable: true });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    reportClientError("ctx", new Error("boom"));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).keepalive).toBe(true);
  });

  it("falls back to fetch when sendBeacon refuses to queue (returns false)", () => {
    const beacon = vi.fn().mockReturnValue(false);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    reportClientError("ctx", new Error("boom"));

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throttles an identical (message+pathname) within the window", () => {
    const beacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });

    reportClientError("ctx", new Error("same"));
    reportClientError("ctx", new Error("same"));
    reportClientError("ctx", new Error("same"));

    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it("does not throttle distinct messages", () => {
    const beacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });

    reportClientError("ctx", new Error("one"));
    reportClientError("ctx", new Error("two"));

    expect(beacon).toHaveBeenCalledTimes(2);
  });

  it("never throws even when both transports fail", () => {
    Object.defineProperty(navigator, "sendBeacon", {
      value: () => {
        throw new Error("beacon broken");
      },
      configurable: true,
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("fetch broken");
    });

    expect(() => reportClientError("ctx", new Error("boom"))).not.toThrow();
  });

  it("handles a non-Error thrown value (string) safely", () => {
    const beacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    const body = captureBlobBody();

    reportClientError("ctx", "just a string");

    const payload = JSON.parse(body.read()) as Record<string, unknown>;
    expect(payload.message).toBe("[ctx] just a string");
    expect(payload.stack).toBeUndefined();
  });
});
