// @vitest-environment node
import { describe, it, expect } from "vitest";
import { runWithRequestContext, getRequestId } from "./request-context";

describe("request-context", () => {
  it("exposes the request id inside the run scope", () => {
    const id = runWithRequestContext({ requestId: "r-1" }, () => getRequestId());
    expect(id).toBe("r-1");
  });

  it("returns undefined outside any run scope", () => {
    expect(getRequestId()).toBeUndefined();
  });

  it("keeps the id across awaited async work", async () => {
    const id = await runWithRequestContext({ requestId: "r-2" }, async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 1));
      return getRequestId();
    });
    expect(id).toBe("r-2");
  });

  it("isolates concurrent contexts", async () => {
    const [a, b] = await Promise.all([
      runWithRequestContext({ requestId: "a" }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getRequestId();
      }),
      runWithRequestContext({ requestId: "b" }, async () => {
        await new Promise((r) => setTimeout(r, 1));
        return getRequestId();
      }),
    ]);
    expect(a).toBe("a");
    expect(b).toBe("b");
  });
});
