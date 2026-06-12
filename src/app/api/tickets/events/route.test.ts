// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GET } from "./route";
import { emitTicketEvent } from "@/lib/ticket-events";

describe("GET /api/tickets/events (broadcast)", () => {
  it("returns SSE headers", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    await res.body?.cancel();
  });

  it("forwards events for every ticket key", async () => {
    const res = await GET();
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    emitTicketEvent({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["status"] });
    emitTicketEvent({ type: "ticket:changed", ticketKey: "VPL-2", kinds: ["comment"], origin: "tab-1" });

    let text = "";
    for (let i = 0; i < 6; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
      if (text.includes("VPL-1") && text.includes("VPL-2")) break;
    }

    expect(text).toContain("event: ticket:changed");
    expect(text).toContain("VPL-1");
    expect(text).toContain("VPL-2");
    expect(text).toContain('"origin":"tab-1"');
    await reader.cancel();
  });
});
