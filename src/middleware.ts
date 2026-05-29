import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/login(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Dev bypass activation endpoint must be reachable before auth is established
  "/api/dev/bypass",
]);

const USER_HEADER = "x-bridge-user-id";

// Defense-in-depth cap on inbound request bodies (1 MB). Next.js does not
// enforce a body size limit for App Router route handlers by default.
const MAX_BODY_BYTES = 1_048_576;
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH"]);

// Continue the request with `x-bridge-user-id` set to the trusted value.
// Always overwrites any client-sent header so it cannot be spoofed; passing
// `undefined` strips it (used on public/unauthenticated paths).
function forwardWithUser(req: Request, userId: string | undefined) {
  const requestHeaders = new Headers(req.headers);
  if (userId) {
    requestHeaders.set(USER_HEADER, userId);
  } else {
    requestHeaders.delete(USER_HEADER);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export default clerkMiddleware(async (auth, req) => {
  // Reject oversized mutating API bodies before they reach a handler.
  if (
    req.nextUrl.pathname.startsWith("/api/") &&
    MUTATING_METHODS.has(req.method)
  ) {
    const contentLength = Number(req.headers.get("content-length") ?? "0");
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "Request body too large" },
        { status: 413 },
      );
    }
  }

  // Dev-only: honor cookie set by GET /api/dev/bypass
  if (
    process.env.NODE_ENV === "development" &&
    req.cookies.get("dev_bypass")?.value === "1"
  ) {
    return forwardWithUser(req, undefined);
  }

  if (isPublicRoute(req)) return forwardWithUser(req, undefined);

  const isApiRoute = req.nextUrl.pathname.startsWith("/api/");
  const { userId } = await auth();

  if (!userId) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Restrict access to the Bridge Clerk org when CLERK_ORG_ID is configured.
  // The user must have this org set as their active organization in Clerk.
  const requiredOrgId = process.env.CLERK_ORG_ID;
  if (requiredOrgId) {
    const { orgId } = await auth();
    if (orgId !== requiredOrgId) {
      if (isApiRoute) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // Forward the authenticated user id so route handlers can bucket rate limits
  // per user (see src/lib/rate-limiter.ts).
  return forwardWithUser(req, userId);
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|apple-touch-icon.png|icons/|sw\\.js).*)",
  ],
};
