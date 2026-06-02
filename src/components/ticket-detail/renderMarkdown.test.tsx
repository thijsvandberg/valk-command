import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./renderMarkdown";

// Renders markdown with reference linkification enabled (the ticket-description
// mode) and returns the container for querying.
function renderDesc(md: string) {
  return render(<div>{renderMarkdown(md, { linkifyRefs: true })}</div>);
}

// The pill renders the ticket key inside an <a href="/tickets/KEY">.
const pillFor = (c: HTMLElement, key: string) =>
  c.querySelector(`a[href="/tickets/${key}"]`);

describe("renderMarkdown — VPL reference linkification", () => {
  it("turns a bare key in plain text into a pill linking to the internal ticket", () => {
    const { container } = renderDesc("This depends on VPL-43237 for delivery.");
    const pill = pillFor(container, "VPL-43237");
    expect(pill).toBeTruthy();
    expect(pill?.textContent).toContain("VPL-43237");
  });

  it("converts multiple bare keys in the same paragraph", () => {
    const { container } = renderDesc("See VPL-1 and VPL-2.");
    expect(pillFor(container, "VPL-1")).toBeTruthy();
    expect(pillFor(container, "VPL-2")).toBeTruthy();
  });

  it("does NOT convert a key that is already a markdown link", () => {
    const { container } = renderDesc("[VPL-1](https://example.com/browse/VPL-1)");
    expect(pillFor(container, "VPL-1")).toBeNull();
    const link = container.querySelector('a[href="https://example.com/browse/VPL-1"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain("VPL-1");
  });

  it("does NOT convert a key inside inline code", () => {
    const { container } = renderDesc("Use the key `VPL-1` verbatim.");
    expect(pillFor(container, "VPL-1")).toBeNull();
    const code = container.querySelector("code");
    expect(code?.textContent).toContain("VPL-1");
  });

  it("does NOT convert a key inside a fenced code block", () => {
    const { container } = renderDesc("```\nref: VPL-1\n```");
    expect(pillFor(container, "VPL-1")).toBeNull();
    expect(container.querySelector(".rm-code-block")).toBeTruthy();
  });

  it("does NOT convert a key inside bold/emphasis", () => {
    const { container } = renderDesc("This is **VPL-1** in bold.");
    expect(pillFor(container, "VPL-1")).toBeNull();
    expect(container.querySelector("strong")?.textContent).toContain("VPL-1");
  });

  it("DOES convert a bare key in plain text inside an expandable block", () => {
    const { container } = renderDesc(":::expand Details\nRelated to VPL-99 here.\n:::");
    expect(container.querySelector("details")).toBeTruthy();
    expect(pillFor(container, "VPL-99")).toBeTruthy();
  });

  it("does not pick up a key embedded in a larger token (word boundary)", () => {
    const { container } = renderDesc("Build XVPL-1 and VPL-12abc are not refs.");
    expect(pillFor(container, "VPL-1")).toBeNull();
    expect(pillFor(container, "VPL-12")).toBeNull();
  });

  it("does NOT linkify when linkifyRefs is not enabled (chat/comments default)", () => {
    const { container } = render(<div>{renderMarkdown("Mentions VPL-7 here.")}</div>);
    expect(pillFor(container, "VPL-7")).toBeNull();
    expect(container.textContent).toContain("VPL-7");
  });
});
