import { NextResponse } from "next/server";
import { agentFetch } from "@/lib/agent-fetch";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const result = await agentFetch(`/api/tasks/${id}`);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.error, code: result.error.code },
      { status: result.status || 502 },
    );
  }

  return NextResponse.json(result.data, { status: result.status });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = applyRateLimit("delete");
  if (limited) return limited;

  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const result = await agentFetch(`/api/tasks/${id}`, {
    method: "DELETE",
    retries: 2,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.error, code: result.error.code },
      { status: result.status || 502 },
    );
  }

  return NextResponse.json(result.data, { status: result.status });
}
