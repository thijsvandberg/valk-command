// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Drive the real middleware body but stub Clerk: clerkMiddleware(cb) returns a
// runner that invokes cb with a controllable auth() and the incoming request,
// so we exercise the request-id wiring without a live Clerk session.
let authResult: { userId: string | null; orgId?: string | null } = { userId: "user_123" };
// When true, the mocked auth() rejects, simulating an unconfigured Clerk so the
// dev-bypass branch must fall back to the anonymous owner.
let authThrows = false;

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (
    cb: (auth: () => Promise<typeof authResult>, req: NextRequest) => unknown,
  ) => {
    return (req: NextRequest) =>
      cb(async () => {
        if (authThrows) throw new Error("Clerk not configured");
        return authResult;
      }, req);
  },
  // The public-route matcher is irrelevant to these cases (they hit API/auth
  // paths); a matcher that never matches keeps the auth branch active.
  createRouteMatcher: () => () => false,
}));

import middleware from "./middleware";
import type { NextFetchEvent, NextResponse } from "next/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeReq(path: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(`https://bridge.local${path}`), init as never);
}

// The Clerk-typed signature wants (request, event); the mock ignores the event.
// This helper supplies a stub event and narrows away the nullable return so the
// assertions can read headers without repeated non-null guards.
async function run(req: NextRequest): Promise<NextResponse> {
  const res = await middleware(req, {} as NextFetchEvent);
  if (!res) throw new Error("middleware returned no response");
  return res as NextResponse;
}

describe("middleware request id", () => {
  beforeEach(() => {
    authResult = { userId: "user_123" };
  });

  it("sets x-request-id on the response for an authenticated request", async () => {
    const res = await run(makeReq("/api/tickets"));
    const id = res.headers.get("x-request-id");
    expect(id).toBeTruthy();
    expect(id).toMatch(UUID);
  });

  it("forwards x-request-id to the handler on the request headers", async () => {
    // NextResponse.next encodes the forwarded request headers under this key.
    const res = await run(makeReq("/api/tickets"));
    const forwarded = res.headers.get("x-middleware-request-x-request-id");
    expect(forwarded).toBeTruthy();
    // The forwarded id and the echoed response id are the same correlation id.
    expect(forwarded).toBe(res.headers.get("x-request-id"));
  });

  it("uses a fresh id per request", async () => {
    const a = await run(makeReq("/api/tickets"));
    const b = await run(makeReq("/api/tickets"));
    expect(a.headers.get("x-request-id")).not.toBe(b.headers.get("x-request-id"));
  });

  it("echoes x-request-id even on a 401 rejection", async () => {
    authResult = { userId: null };
    const res = await run(makeReq("/api/tickets"));
    expect(res.status).toBe(401);
    expect(res.headers.get("x-request-id")).toMatch(UUID);
  });

  it("echoes x-request-id on a 413 oversized-body rejection", async () => {
    const res = await run(
      makeReq("/api/tickets", {
        method: "POST",
        headers: { "content-length": String(2 * 1_048_576) },
      }),
    );
    expect(res.status).toBe(413);
    expect(res.headers.get("x-request-id")).toMatch(UUID);
  });
});

describe("middleware rejection logging", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  const ORIGINAL_ORG = process.env.CLERK_ORG_ID;

  beforeEach(() => {
    authResult = { userId: "user_123" };
    delete process.env.CLERK_ORG_ID;
    // Edge middleware cannot import the server-only logger, so rejections use
    // console.warn; spy on it to assert each branch logs method + path + reason.
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    if (ORIGINAL_ORG === undefined) delete process.env.CLERK_ORG_ID;
    else process.env.CLERK_ORG_ID = ORIGINAL_ORG;
  });

  // Asserts a single warn line was emitted and returns it for further checks.
  function soleWarnLine(): string {
    expect(warnSpy).toHaveBeenCalledTimes(1);
    return String(warnSpy.mock.calls[0][0]);
  }

  it("logs a 401 with method + path + reason for an unauthenticated API request", async () => {
    authResult = { userId: null };
    const res = await run(makeReq("/api/tickets", { method: "GET" }));
    expect(res.status).toBe(401);
    const line = soleWarnLine();
    expect(line).toContain("[middleware]");
    expect(line).toContain("GET");
    expect(line).toContain("/api/tickets");
    expect(line).toContain("401");
  });

  it("logs the /login redirect for an unauthenticated page request", async () => {
    authResult = { userId: null };
    const res = await run(makeReq("/dashboard", { method: "GET" }));
    expect(res.status).toBe(307);
    const line = soleWarnLine();
    expect(line).toContain("GET");
    expect(line).toContain("/dashboard");
    expect(line.toLowerCase()).toContain("login");
  });

  it("logs a 413 with the content-length and method + path", async () => {
    const res = await run(
      makeReq("/api/tickets", {
        method: "POST",
        headers: { "content-length": String(2 * 1_048_576) },
      }),
    );
    expect(res.status).toBe(413);
    const line = soleWarnLine();
    expect(line).toContain("POST");
    expect(line).toContain("/api/tickets");
    expect(line).toContain("413");
    // The specific detail (the oversized content-length) is in the line.
    expect(line).toContain(String(2 * 1_048_576));
  });

  it("logs a 403 org mismatch with the orgId-vs-requiredOrgId detail on an API request", async () => {
    process.env.CLERK_ORG_ID = "org_required";
    authResult = { userId: "user_123", orgId: "org_other" };
    const res = await run(makeReq("/api/tickets", { method: "GET" }));
    expect(res.status).toBe(403);
    const line = soleWarnLine();
    expect(line).toContain("403");
    expect(line).toContain("/api/tickets");
    expect(line).toContain("org_other");
    expect(line).toContain("org_required");
  });

  it("logs the /login redirect on a page org mismatch", async () => {
    process.env.CLERK_ORG_ID = "org_required";
    authResult = { userId: "user_123", orgId: null };
    const res = await run(makeReq("/dashboard", { method: "GET" }));
    expect(res.status).toBe(307);
    const line = soleWarnLine();
    expect(line.toLowerCase()).toContain("login");
    expect(line).toContain("org_required");
    // A null active org is rendered as a placeholder, never a credential value.
    expect(line).toContain("orgId=none");
  });

  it("preserves the requested path as redirect_url on the /login redirect", async () => {
    authResult = { userId: null };
    const res = await run(makeReq("/tickets/VPL-47093", { method: "GET" }));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") as string);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect_url")).toBe("/tickets/VPL-47093");
  });

  it("includes the query string in the preserved redirect_url", async () => {
    authResult = { userId: null };
    const res = await run(makeReq("/tickets/VPL-1?tab=links", { method: "GET" }));
    const location = new URL(res.headers.get("location") as string);
    expect(location.searchParams.get("redirect_url")).toBe("/tickets/VPL-1?tab=links");
  });

  it("omits redirect_url when the requested page is the root", async () => {
    authResult = { userId: null };
    const res = await run(makeReq("/", { method: "GET" }));
    const location = new URL(res.headers.get("location") as string);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.has("redirect_url")).toBe(false);
  });

  it("preserves redirect_url on a page org mismatch too", async () => {
    process.env.CLERK_ORG_ID = "org_required";
    authResult = { userId: "user_123", orgId: null };
    const res = await run(makeReq("/tickets/VPL-9", { method: "GET" }));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") as string);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect_url")).toBe("/tickets/VPL-9");
  });

  it("does not log on an allowed authenticated request", async () => {
    const res = await run(makeReq("/api/tickets", { method: "GET" }));
    expect(res.status).not.toBe(401);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("never logs a token or secret value in a rejection line", async () => {
    process.env.CLERK_ORG_ID = "org_required";
    authResult = { userId: "user_123", orgId: "org_other" };
    await run(makeReq("/api/tickets", { method: "GET" }));
    const line = soleWarnLine();
    // The user id is an internal identifier, but no Authorization/cookie/token
    // material should ever appear in the reason string.
    expect(line.toLowerCase()).not.toContain("bearer");
    expect(line.toLowerCase()).not.toContain("authorization");
    expect(line.toLowerCase()).not.toContain("password");
  });
});

describe("middleware dev bypass identity", () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  // NextResponse.next encodes forwarded request headers under this key.
  const FORWARDED_USER = "x-middleware-request-x-bridge-user-id";

  // NODE_ENV is typed read-only; the cast lets the test drive the dev-only branch.
  const env = process.env as Record<string, string | undefined>;

  beforeEach(() => {
    authResult = { userId: "user_123" };
    authThrows = false;
    env.NODE_ENV = "development";
  });

  afterEach(() => {
    authThrows = false;
    env.NODE_ENV = ORIGINAL_NODE_ENV ?? "test";
  });

  function bypassReq(path: string): NextRequest {
    return makeReq(path, { headers: { cookie: "dev_bypass=1" } });
  }

  it("forwards the real Clerk user id when a session exists under the bypass cookie", async () => {
    authResult = { userId: "user_real" };
    const res = await run(bypassReq("/api/new-stories/count"));
    expect(res.headers.get(FORWARDED_USER)).toBe("user_real");
  });

  it("forwards no user id when the bypass cookie is set but no Clerk session exists", async () => {
    authResult = { userId: null };
    const res = await run(bypassReq("/api/new-stories/count"));
    // Stripped header => resolveUserId() falls back to the anonymous "global" owner.
    expect(res.headers.get(FORWARDED_USER)).toBeNull();
  });

  it("falls back to anonymous when auth() throws (Clerk unconfigured)", async () => {
    authThrows = true;
    const res = await run(bypassReq("/api/new-stories/count"));
    expect(res.headers.get(FORWARDED_USER)).toBeNull();
  });
});
