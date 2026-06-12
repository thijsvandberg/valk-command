// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GET } from "./route";
import { emitTicketEvent } from "@/lib/ticket-events";

const makeParams = (key: string) => ({ params: Promise.resolve({ key }) });
const makeRequest = () => new Request("http://localhost:3100/api/tickets/VPL-1/events");

describe("GET /api/tickets/[key]/events", () => {
  it("returns SSE headers", async () => {
    const res = await GET(makeRequest(), makeParams("VPL-1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    await res.body?.cancel();
  });

  it("rejects an invalid key", async () => {
    const res = await GET(makeRequest(), makeParams("bad\0key"));
    expect(res.status).toBe(400);
  });

  it("forwards events for the subscribed key and filters others", async () => {
    const res = await GET(makeRequest(), makeParams("VPL-1"));
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // The listener is registered synchronously while constructing the stream,
    // so emitting after GET resolves is safe.
    emitTicketEvent({ type: "ticket:changed", ticketKey: "VPL-2", kinds: ["status"] });
    emitTicketEvent({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["comment"] });

    let text = "";
    for (let i = 0; i < 5; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
      if (text.includes("VPL-1")) break;
    }

    expect(text).toContain("event: ticket:changed");
    expect(text).toContain("VPL-1");
    expect(text).toContain('"kinds":["comment"]');
    expect(text).not.toContain("VPL-2");
    await reader.cancel();
  });
});
