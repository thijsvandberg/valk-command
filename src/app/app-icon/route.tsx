import type { NextRequest } from "next/server";
import { renderAppIcon } from "@/lib/app-icon";

export const runtime = "nodejs";

/**
 * PWA / notification icon endpoint. The manifest references this with explicit
 * sizes (and ?maskable=1) so installed-app icons stay in sync with the favicon.
 */
export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const size = Math.min(1024, Math.max(16, Number(sp.get("size") ?? 512)));
  const maskable = sp.get("maskable") === "1";
  return renderAppIcon(size, { maskable });
}
