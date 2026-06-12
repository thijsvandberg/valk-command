// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GET } from "./route";
import { emitTicketEvent } from "@/lib/ticket-events";
import { emitRefinementEvent } from "@/lib/refinement-events";

async function readUntil(res: Response, predicate: (text: string) => boolean): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (let i = 0; i < 8; i++) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
    if (predicate(text)) break;
  }
  await reader.cancel();
  return text;
}

describe("GET /api/events (unified stream)", () => {
  it("returns SSE headers", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    await res.body?.cancel();
  });

  it("forwards ticket events wrapped in a ticket envelope", async () => {
    const res = await GET();
    const emitted = Promise.resolve().then(() =>
      emitTicketEvent({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["status"], origin: "tab-1" }),
    );
    const text = await readUntil(res, (t) => t.includes("VPL-1"));
    await emitted;

    expect(text).toContain('"channel":"ticket"');
    expect(text).toContain('"ticketKey":"VPL-1"');
    expect(text).toContain('"origin":"tab-1"');
  });

  it("forwards refinement events wrapped in a refinement envelope", async () => {
    const res = await GET();
    const emitted = Promise.resolve().then(() =>
      emitRefinementEvent({ type: "bulk-suggest:progress", sessionId: "s1" }),
    );
    const text = await readUntil(res, (t) => t.includes("bulk-suggest"));
    await emitted;

    expect(text).toContain('"channel":"refinement"');
    expect(text).toContain('"type":"bulk-suggest:progress"');
    expect(text).toContain('"sessionId":"s1"');
  });

  it("carries both families on the same connection", async () => {
    const res = await GET();
    const emitted = Promise.resolve().then(() => {
      emitTicketEvent({ type: "ticket:changed", ticketKey: "VPL-2", kinds: ["comment"] });
      emitRefinementEvent({ type: "tickets:updated" });
    });
    const text = await readUntil(res, (t) => t.includes("VPL-2") && t.includes("tickets:updated"));
    await emitted;

    expect(text).toContain('"channel":"ticket"');
    expect(text).toContain('"channel":"refinement"');
  });
});
