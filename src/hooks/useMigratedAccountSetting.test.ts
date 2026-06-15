import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { createElement } from "react";
import { useMigratedAccountSetting } from "./useMigratedAccountSetting";

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(SWRConfig, { value: { provider: () => new Map() } }, children);
}

const URL = "/api/settings/test-pref";
const LOCAL_KEY = "test-pref-local";
const MIGRATED_FLAG = `${LOCAL_KEY}-migrated`;

function mockServer(serverValue: unknown) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    if ((init as RequestInit | undefined)?.method === "PUT") {
      const body = JSON.parse((init as RequestInit).body as string);
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ value: serverValue }), { status: 200 }));
  });
}

describe("useMigratedAccountSetting", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("imports a legacy localStorage value when the server value is still the default", async () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify("imported"));
    const fetchMock = mockServer("default");

    const { result } = renderHook(
      () => useMigratedAccountSetting<string>(URL, LOCAL_KEY, "default"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => {
      const put = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "PUT");
      expect(put).toBeDefined();
    });
    const put = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "PUT");
    expect(JSON.parse((put![1] as RequestInit).body as string).value).toBe("imported");
    expect(localStorage.getItem(MIGRATED_FLAG)).toBe("1");
  });

  it("does not import when the server already holds a non-default value", async () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify("imported"));
    const fetchMock = mockServer("server-set");

    const { result } = renderHook(
      () => useMigratedAccountSetting<string>(URL, LOCAL_KEY, "default"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Give the migration effect a chance to (not) fire.
    await waitFor(() => expect(localStorage.getItem(MIGRATED_FLAG)).toBe("1"));
    const put = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "PUT");
    expect(put).toBeUndefined();
    expect(result.current.value).toBe("server-set");
  });

  it("never imports twice (idempotent via the migrated flag)", async () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify("imported"));
    localStorage.setItem(MIGRATED_FLAG, "1");
    const fetchMock = mockServer("default");

    const { result } = renderHook(
      () => useMigratedAccountSetting<string>(URL, LOCAL_KEY, "default"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await new Promise((r) => setTimeout(r, 20));
    const put = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "PUT");
    expect(put).toBeUndefined();
  });

  it("tolerates a corrupt localStorage value without throwing", async () => {
    localStorage.setItem(LOCAL_KEY, "{not json");
    mockServer("default");

    const { result } = renderHook(
      () => useMigratedAccountSetting<string>(URL, LOCAL_KEY, "default"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.value).toBe("default");
  });
});
