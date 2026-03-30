import { agentUrl, agentHeaders } from "@/lib/agent-proxy";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const headers = agentHeaders();
    delete headers["Content-Type"];

    const upstream = await fetch(agentUrl(`/api/tasks/${id}/stream`), {
      headers,
    });

    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: "Task not found" }), {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!upstream.body) {
      return new Response(JSON.stringify({ error: "No stream body" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Pipe the SSE stream from valk-agent to the browser
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Agent unreachable" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
