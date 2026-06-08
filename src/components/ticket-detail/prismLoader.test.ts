import { describe, it, expect } from "vitest";
import { extractCodeLanguages } from "./prismLoader";

// extractCodeLanguages feeds ensureLanguages, so a detected bare-fence grammar
// must show up here for it to be preloaded before renderMarkdown highlights it.
describe("extractCodeLanguages — bare fence detection (BRDG-316)", () => {
  it("surfaces the detected grammar for a bare JS fence", () => {
    const md = "intro\n```\nconst x = () => 1 === 1 && true;\nwindow.console.log(x);\n```";
    expect(extractCodeLanguages(md)).toContain("javascript");
  });

  it("surfaces json for a bare JSON fence", () => {
    expect(extractCodeLanguages('```\n{ "a": 1, "b": 2, "c": 3 }\n```')).toContain("json");
  });

  it("surfaces nothing for an ambiguous bare fence", () => {
    expect(extractCodeLanguages("```\njust plain english prose, nothing codey at all\n```")).toEqual([]);
  });

  it("uses the explicit tag verbatim (resolved) for tagged fences", () => {
    expect(extractCodeLanguages("```ts\nconst a: number = 1;\n```")).toContain("typescript");
  });

  it("handles a mix of tagged and bare fences", () => {
    const md = "```py\nprint('hi')\n```\n\ntext\n\n```\n{ \"x\": 10, \"y\": 20 }\n```";
    const langs = extractCodeLanguages(md);
    expect(langs).toContain("python");
    expect(langs).toContain("json");
  });
});
