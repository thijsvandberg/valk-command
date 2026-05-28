import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { cache } from "@/lib/cache";
import { fetchDevInfo, EMPTY_DEV_INFO } from "@/lib/bitbucket-client";

export type { DevBranch, PrApproval, DevPullRequest, DevCommit, DevBuild, DevDeployment, DevInfoPayload } from "@/lib/bitbucket-client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const cacheKey = `/api/tickets/${key}/dev-info`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
    });
  }

  const payload = await fetchDevInfo(key);
  if (payload !== EMPTY_DEV_INFO) {
    cache.set(cacheKey, payload, 120_000);
  }
  return NextResponse.json(payload, {
    headers: { "X-Cache": "MISS", "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
  });
}
