// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { publishTicketSync, subscribeTicketSync } from "./ticket-sync-channel";

// A BroadcastChannel never delivers to the instance that posted; cross-instance
// delivery in real runtimes is async and flaky under vitest. This fake mirrors the
// "deliver to every other open instance of the same name" contract synchronously,
// so the test asserts our wiring (subscribe/unsubscribe/publish), not Node timing.
type Listener = (event: { data: unknown }) => void;

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  private listeners = new Set<Listener>();
  closed = false;
  constructor(public name: string) {
    FakeBroadcastChannel.instances.push(this);
  }
  postMessage(data: unknown) {
    for (const inst of FakeBroadcastChannel.instances) {
      if (inst === this || inst.closed || inst.name !== this.name) continue;
      for (const listener of inst.listeners) listener({ data });
    }
  }
  addEventListener(type: string, cb: Listener) {
    if (type === "message") this.listeners.add(cb);
  }
  removeEventListener(type: string, cb: Listener) {
    if (type === "message") this.listeners.delete(cb);
  }
  close() {
    this.closed = true;
    this.listeners.clear();
  }
}

const realBroadcastChannel = globalThis.BroadcastChannel;

beforeEach(() => {
  FakeBroadcastChannel.instances = [];
  (globalThis as { BroadcastChannel: unknown }).BroadcastChannel = FakeBroadcastChannel;
});

afterAll(() => {
  (globalThis as { BroadcastChannel: unknown }).BroadcastChannel = realBroadcastChannel;
});

describe("ticket-sync-channel", () => {
  it("delivers a published message to subscribers in another context", () => {
    const received: Array<{ key: string; editState: string }> = [];
    subscribeTicketSync((m) => received.push(m));

    publishTicketSync({ key: "VPL-100", editState: "clean" });

    expect(received).toContainEqual({ key: "VPL-100", editState: "clean" });
  });

  it("stops delivering after unsubscribe", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeTicketSync((m) => received.push(m));
    unsubscribe();

    publishTicketSync({ key: "VPL-200", editState: "clean" });

    expect(received).toHaveLength(0);
  });
});
