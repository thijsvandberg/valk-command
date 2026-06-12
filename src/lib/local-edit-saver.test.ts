import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useLocalEditSaver } from "./local-edit-saver";

function okResponse(modifiedAt: string) {
  return { ok: true, json: async () => ({ modifiedAt }) } as Response;
}

function conflictResponse() {
  return {
    ok: false,
    status: 409,
    json: async () => ({ error: "Draft was modified elsewhere", code: "CONFLICT" }),
  } as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("useLocalEditSaver", () => {
  it("records the returned modifiedAt and sends it as baseModifiedAt on the next save", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(okResponse("T1"));
    const { result } = renderHook(() => useLocalEditSaver());

    await act(async () => {
      await result.current.persistLocalEdit("VPL-1", "description", "v1");
    });
    await act(async () => {
      await result.current.persistLocalEdit("VPL-1", "description", "v2");
    });

    const bodies = fetchSpy.mock.calls.map(([, init]) => JSON.parse(init!.body as string));
    expect(bodies[0].baseModifiedAt).toBeUndefined();
    expect(bodies[1].baseModifiedAt).toBe("T1");
  });

  it("tracks tokens per ticket+field independently", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(okResponse("DESC-1"))
      .mockResolvedValueOnce(okResponse("TITLE-1"))
      .mockResolvedValueOnce(okResponse("DESC-2"));
    const { result } = renderHook(() => useLocalEditSaver());

    await act(async () => {
      await result.current.persistLocalEdit("VPL-1", "description", "d");
      await result.current.persistLocalEdit("VPL-1", "title", "t");
      await result.current.persistLocalEdit("VPL-1", "description", "d2");
    });

    const bodies = fetchSpy.mock.calls.map(([, init]) => JSON.parse(init!.body as string));
    expect(bodies[1].baseModifiedAt).toBeUndefined();
    expect(bodies[2].baseModifiedAt).toBe("DESC-1");
  });

  it("omits the token when saving blind", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(okResponse("T1"));
    const { result } = renderHook(() => useLocalEditSaver());

    await act(async () => {
      await result.current.persistLocalEdit("VPL-1", "description", "v1");
    });
    await act(async () => {
      await result.current.persistLocalEdit("VPL-1", "description", "v2", { blind: true });
    });

    const bodies = fetchSpy.mock.calls.map(([, init]) => JSON.parse(init!.body as string));
    expect(bodies[1].baseModifiedAt).toBeUndefined();
  });

  it("flips conflict + pause on 409 and remembers the rejected write", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(okResponse("T1"))
      .mockResolvedValueOnce(conflictResponse());
    const { result } = renderHook(() => useLocalEditSaver());

    await act(async () => {
      await result.current.persistLocalEdit("VPL-1", "description", "v1");
    });
    await act(async () => {
      await expect(
        result.current.persistLocalEdit("VPL-1", "description", "mine"),
      ).rejects.toThrow();
    });

    expect(result.current.conflict).toBe(true);
    expect(result.current.isPaused()).toBe(true);
    expect(result.current.isConflictPaused()).toBe(true);
  });

  it("overwrite() re-saves the rejected value blind and clears the conflict", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(conflictResponse())
      .mockResolvedValueOnce(okResponse("T2"));
    const { result } = renderHook(() => useLocalEditSaver());

    await act(async () => {
      await expect(
        result.current.persistLocalEdit("VPL-1", "description", "mine"),
      ).rejects.toThrow();
    });
    await act(async () => {
      await result.current.overwrite();
    });

    const retryBody = JSON.parse(fetchSpy.mock.calls[1][1]!.body as string);
    expect(retryBody.localValue).toBe("mine");
    expect(retryBody.baseModifiedAt).toBeUndefined();
    expect(result.current.conflict).toBe(false);
    expect(result.current.isPaused()).toBe(false);
  });

  it("clearConflict() unpauses without writing", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(conflictResponse());
    const { result } = renderHook(() => useLocalEditSaver());

    await act(async () => {
      await expect(
        result.current.persistLocalEdit("VPL-1", "title", "x"),
      ).rejects.toThrow();
    });
    const calls = fetchSpy.mock.calls.length;

    await act(async () => {
      result.current.clearConflict();
    });

    expect(result.current.conflict).toBe(false);
    expect(result.current.isPaused()).toBe(false);
    expect(fetchSpy.mock.calls.length).toBe(calls);
  });

  it("setToken seeds a base for the next save; clearTokens drops them all", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(okResponse("NEW"));
    const { result } = renderHook(() => useLocalEditSaver());

    act(() => {
      result.current.setToken("VPL-1", "description", "SEEDED");
    });
    await act(async () => {
      await result.current.persistLocalEdit("VPL-1", "description", "v1");
    });
    act(() => {
      result.current.clearTokens();
    });
    await act(async () => {
      await result.current.persistLocalEdit("VPL-1", "description", "v2");
    });

    const bodies = fetchSpy.mock.calls.map(([, init]) => JSON.parse(init!.body as string));
    expect(bodies[0].baseModifiedAt).toBe("SEEDED");
    expect(bodies[1].baseModifiedAt).toBeUndefined();
  });

  it("setExternalPause only affects isPaused, not the conflict flag", () => {
    const { result } = renderHook(() => useLocalEditSaver());

    act(() => {
      result.current.setExternalPause(true);
    });
    expect(result.current.isPaused()).toBe(true);
    expect(result.current.isConflictPaused()).toBe(false);
    expect(result.current.conflict).toBe(false);

    act(() => {
      result.current.setExternalPause(false);
    });
    expect(result.current.isPaused()).toBe(false);
  });
});
