import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "bridge_session";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/",
  "/_next/",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
  "/sw.js",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function isStaticAsset(pathname: string): boolean {
  return /\.(ico|png|jpg|jpeg|svg|gif|webp|css|js|woff2?|ttf|eot|map)$/.test(pathname);
}

async function isValidSession(token: string): Promise<boolean> {
  try {
    let secret = process.env.JWT_SECRET;
    if (!secret) {
      // Fallback: in middleware (Edge runtime) we cannot access the DB
      // so if JWT_SECRET env is not set, we pass through and let the
      // API route or page server component do the full check.
      return true;
    }
    const key = new TextEncoder().encode(secret);
    await jwtVerify(token, key);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public paths and static assets
  if (isPublicPath(pathname) || isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return handleUnauthenticated(request);
  }

  const valid = await isValidSession(token);
  if (!valid) {
    return handleUnauthenticated(request);
  }

  // Sliding expiry: refresh the cookie on each request
  const response = NextResponse.next();
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return response;
}

function handleUnauthenticated(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // API routes return 401
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  // Pages redirect to login
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Match all paths except _next/static, _next/image, and static files
    "/((?!_next/static|_next/image).*)",
  ],
};
