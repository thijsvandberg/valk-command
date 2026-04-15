import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/login(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Dev bypass activation endpoint must be reachable before auth is established
  "/api/dev/bypass",
]);

export default clerkMiddleware(async (auth, req) => {
  // Dev-only: honor cookie set by GET /api/dev/bypass
  if (
    process.env.NODE_ENV === "development" &&
    req.cookies.get("dev_bypass")?.value === "1"
  ) {
    return NextResponse.next();
  }

  if (isPublicRoute(req)) return NextResponse.next();

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
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|apple-touch-icon.png|icons/|sw\\.js).*)",
  ],
};
