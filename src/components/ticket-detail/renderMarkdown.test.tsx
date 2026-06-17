import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import Prism from "prismjs";

// TicketRefPill (rendered for linkified refs) fetches ticket detail after mount.
// Stub the fetcher so these tests stay focused on linkification, not network.
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, swrFetcher: vi.fn().mockResolvedValue(undefined) };
});

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

  it("converts a full Jira /browse/ link into a pill", () => {
    const { container } = renderDesc("See [VPL-39873](https://new-story.atlassian.net/browse/VPL-39873) for context.");
    expect(pillFor(container, "VPL-39873")).toBeTruthy();
    // The original external anchor is replaced by the pill.
    expect(container.querySelector('a[href*="atlassian.net/browse"]')).toBeNull();
  });

  it("converts a bare /browse/ link (text == url) into a pill", () => {
    const { container } = renderDesc("https://new-story.atlassian.net/browse/VPL-39873");
    expect(pillFor(container, "VPL-39873")).toBeTruthy();
    // The whole URL is replaced — no leftover scheme/host/path text.
    expect(container.textContent).not.toContain("https://");
    expect(container.textContent).not.toContain("/browse/");
  });

  it("replaces the whole bare /browse/ URL (with surrounding text) by a single pill", () => {
    const { container } = renderDesc("lijkt op de card - https://new-story.atlassian.net/browse/VPL-45730 hier");
    expect(pillFor(container, "VPL-45730")).toBeTruthy();
    // The URL prefix must not linger as plain text next to the pill.
    expect(container.textContent).not.toContain("atlassian.net");
    expect(container.textContent).not.toContain("/browse/");
    // Surrounding prose is preserved.
    expect(container.textContent).toContain("lijkt op de card -");
    expect(container.textContent).toContain("hier");
  });

  it("converts an angle-bracket autolink <browse url> into a pill without stray brackets", () => {
    const { container } = renderDesc('card - <https://new-story.atlassian.net/browse/VPL-45730>');
    expect(pillFor(container, "VPL-45730")).toBeTruthy();
    expect(container.textContent).not.toContain("<");
    expect(container.textContent).not.toContain(">");
    expect(container.textContent).not.toContain("/browse/");
    expect(container.textContent).toContain("card -");
  });

  it("renders a non-browse autolink <url> as an anchor without stray brackets", () => {
    const { container } = renderDesc("see <https://example.com/docs> please");
    const link = container.querySelector('a[href="https://example.com/docs"]');
    expect(link).toBeTruthy();
    expect(container.textContent).not.toContain("<");
    expect(container.textContent).not.toContain(">");
  });

  it("leaves a non-browse link alone, even when its text contains a key", () => {
    const { container } = renderDesc("[VPL-1 docs](https://example.com/page)");
    expect(pillFor(container, "VPL-1")).toBeNull();
    const link = container.querySelector('a[href="https://example.com/page"]');
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

  it("renders a short code block expanded (code grid visible)", () => {
    const { container } = renderDesc("```js\nconst a = 1;\n```");
    expect(container.querySelector(".rm-code-content")).toBeTruthy();
  });

  it("renders a long code block collapsed by default (no code grid)", () => {
    const longBlock = "```js\n" + Array.from({ length: 20 }, (_, i) => `const v${i} = ${i};`).join("\n") + "\n```";
    const { container } = renderDesc(longBlock);
    expect(container.querySelector(".rm-code-block")).toBeTruthy();
    expect(container.querySelector(".rm-code-content")).toBeNull();
    expect(container.textContent).toContain("JS · 20 lines");
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

describe("renderMarkdown — untagged code fence highlighting (BRDG-316)", () => {
  // prismjs core ships markup/css/clike/javascript; json is a separate component
  // that expects a global `Prism`. renderMarkdown highlights synchronously, so the
  // grammars must be registered before rendering (the app does this via
  // usePrismLanguages + ensureLanguages).
  beforeAll(async () => {
    (globalThis as unknown as { Prism: typeof Prism }).Prism = Prism;
    // Template-literal specifier mirrors prismLoader's dynamic import so TS does
    // not demand a (non-existent) type declaration for the component module.
    const component = "json";
    await import(`prismjs/components/prism-${component}`);
  });

  const tokens = (c: HTMLElement) => c.querySelectorAll(".rm-code-content .token");

  it("highlights a bare ``` fence whose content is recognizably JavaScript", () => {
    const md = "```\nconst total = items.reduce((a, b) => a + b, 0) === 42;\nwindow.console.log(total);\n```";
    const { container } = render(<div>{renderMarkdown(md)}</div>);
    expect(container.querySelector(".rm-code-content")).toBeTruthy();
    expect(tokens(container).length).toBeGreaterThan(0);
  });

  it("highlights a bare ``` fence whose content is JSON", () => {
    const md = '```\n{ "event": "search_results", "numRooms": 7, "ok": true }\n```';
    const { container } = render(<div>{renderMarkdown(md)}</div>);
    expect(container.querySelector(".rm-code-content")).toBeTruthy();
    expect(tokens(container).length).toBeGreaterThan(0);
  });

  it("leaves an ambiguous bare ``` fence as plain text (no token spans)", () => {
    const md = "```\nthis is just some prose describing the booking flow in words\n```";
    const { container } = render(<div>{renderMarkdown(md)}</div>);
    expect(container.querySelector(".rm-code-content")).toBeTruthy();
    expect(tokens(container).length).toBe(0);
  });

  it("does not assert a language label for an inferred fence", () => {
    // Long enough to render collapsed: the summary must read "Code", not a guessed lang.
    const body = Array.from({ length: 20 }, (_, i) => `let detected_${i} = ${i} === ${i};`).join("\n");
    const { container } = render(<div>{renderMarkdown("```\n" + body + "\n```")}</div>);
    expect(container.textContent).toContain("Code · 20 lines");
    expect(container.textContent).not.toContain("JAVASCRIPT");
  });

  it("keeps using the explicit tag for a tagged fence (detection not run)", () => {
    const md = "```js\nconst tagged = 1 === 1 && true;\n```";
    const { container } = render(<div>{renderMarkdown(md)}</div>);
    expect(tokens(container).length).toBeGreaterThan(0);
  });
});

describe("renderMarkdown — block glued onto an image line (BRDG-366)", () => {
  it("renders a heading glued to an image as a real heading", () => {
    // A prior editor save dropped the blank line, producing "![..](url)### Design".
    const md = "![trace](/api/attachments/att-1)### Design\n\nbody text";
    const { container } = render(<div>{renderMarkdown(md)}</div>);
    const h3 = container.querySelector("h3");
    expect(h3?.textContent).toBe("Design");
    expect(container.querySelector("figure img")).toBeTruthy();
    expect(container.textContent).not.toContain("### Design");
  });

  it("renders a bullet list glued to an image as a list", () => {
    const md = "![trace](/api/attachments/att-1)- first\n- second";
    const { container } = render(<div>{renderMarkdown(md)}</div>);
    expect(container.querySelectorAll("li").length).toBe(2);
    expect(container.querySelector("figure img")).toBeTruthy();
  });
});
