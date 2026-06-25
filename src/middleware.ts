import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/login(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Dynamically generated app icons (favicon, apple, PWA) must be reachable
  // without auth so browsers and OS installers can fetch them.
  "/icon",
  "/apple-icon",
  "/app-icon",
  // Dev bypass activation endpoint must be reachable before auth is established
  "/api/dev/bypass",
]);

const USER_HEADER = "x-bridge-user-id";
const REQUEST_ID_HEADER = "x-request-id";

// Defense-in-depth cap on inbound request bodies (1 MB). Next.js does not
// enforce a body size limit for App Router route handlers by default.
const MAX_BODY_BYTES = 1_048_576;
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH"]);

// Middleware runs in the Edge runtime where the server-only logger cannot be
// imported, so rejections use console.warn directly. start-prod.sh tees stdout/
// stderr to the prod log, so these lines still land there. The tag mirrors the
// server logger's "[tag]" convention to stay greppable alongside app logs.
function logRejection(reason: string, req: { method: string; nextUrl: { pathname: string } }) {
  console.warn(`WARN [middleware] rejected ${req.method} ${req.nextUrl.pathname}: ${reason}`);
}

// Continue the request with `x-bridge-user-id` set to the trusted value and the
// correlation id forwarded to the handler plus echoed on the response.
// Always overwrites any client-sent user header so it cannot be spoofed; passing
// `undefined` strips it (used on public/unauthenticated paths).
function forwardWithUser(req: Request, userId: string | undefined, requestId: string) {
  const requestHeaders = new Headers(req.headers);
  if (userId) {
    requestHeaders.set(USER_HEADER, userId);
  } else {
    requestHeaders.delete(USER_HEADER);
  }
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set(REQUEST_ID_HEADER, requestId);
  return res;
}

export default clerkMiddleware(async (auth, req) => {
  // One correlation id per request, generated as early as possible so every
  // path below (including the rejections) can echo it on the response and the
  // handler can read it off the forwarded request. crypto is a global in the
  // Edge runtime, so no node:crypto import.
  const requestId = crypto.randomUUID();

  // Reject oversized mutating API bodies before they reach a handler.
  if (
    req.nextUrl.pathname.startsWith("/api/") &&
    MUTATING_METHODS.has(req.method)
  ) {
    const contentLength = Number(req.headers.get("content-length") ?? "0");
    if (contentLength > MAX_BODY_BYTES) {
      logRejection(
        `413 oversized body (content-length=${contentLength}, max=${MAX_BODY_BYTES})`,
        req,
      );
      return NextResponse.json(
        { error: "Request body too large" },
        { status: 413, headers: { [REQUEST_ID_HEADER]: requestId } },
      );
    }
  }

  // Dev-only: honor cookie set by GET /api/dev/bypass
  if (
    process.env.NODE_ENV === "development" &&
    req.cookies.get("dev_bypass")?.value === "1"
  ) {
    return forwardWithUser(req, undefined, requestId);
  }

  if (isPublicRoute(req)) return forwardWithUser(req, undefined, requestId);

  const isApiRoute = req.nextUrl.pathname.startsWith("/api/");
  const { userId } = await auth();

  if (!userId) {
    if (isApiRoute) {
      logRejection("401 no authenticated user", req);
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401, headers: { [REQUEST_ID_HEADER]: requestId } },
      );
    }
    logRejection("redirect to /login (no authenticated user)", req);
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Restrict access to the Bridge Clerk org when CLERK_ORG_ID is configured.
  // The user must have this org set as their active organization in Clerk.
  const requiredOrgId = process.env.CLERK_ORG_ID;
  if (requiredOrgId) {
    const { orgId } = await auth();
    if (orgId !== requiredOrgId) {
      // orgId/requiredOrgId are Clerk org identifiers (org_...), not secrets;
      // logging the mismatch is what makes a 403 actionable.
      const mismatch = `orgId=${orgId ?? "none"} != requiredOrgId=${requiredOrgId}`;
      if (isApiRoute) {
        logRejection(`403 org mismatch (${mismatch})`, req);
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403, headers: { [REQUEST_ID_HEADER]: requestId } },
        );
      }
      logRejection(`redirect to /login (org mismatch: ${mismatch})`, req);
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // Forward the authenticated user id so route handlers can bucket rate limits
  // per user (see src/lib/rate-limiter.ts).
  return forwardWithUser(req, userId, requestId);
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|apple-touch-icon.png|icons/|sw\\.js).*)",
  ],
};
