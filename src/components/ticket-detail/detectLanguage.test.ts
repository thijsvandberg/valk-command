import { describe, it, expect } from "vitest";
import { detectFenceLanguage } from "./detectLanguage";

describe("detectFenceLanguage", () => {
  it("detects a JSON object via strict parse", () => {
    const code = `{
  "event": "search_results",
  "numRooms": 2,
  "rooms": ["comfort", "luxe"]
}`;
    expect(detectFenceLanguage(code)).toBe("json");
  });

  it("does not call a JS object literal JSON (unquoted keys / trailing call)", () => {
    const code = `window.dataLayer.push({ event: 'x', numRooms: 2 });`;
    expect(detectFenceLanguage(code)).not.toBe("json");
  });

  it("detects the real-world dataLayer snippet as javascript", () => {
    const code = `// when availability call is finished on the /configuration page
<script>
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
        'event': 'search_results',
        'eventLocation': 'bookingtool-platform.example.com',
        'data': {
            'numRooms': 2,
            'hotelCode': 'VEE', //needs to be capitalized
        }
    });
</script>`;
    expect(detectFenceLanguage(code)).toBe("javascript");
  });

  it("detects plain javascript", () => {
    const code = `const sum = (a, b) => {
  return a + b;
};
console.log(sum(1, 2) === 3 && true);`;
    expect(detectFenceLanguage(code)).toBe("javascript");
  });

  it("detects a CSS rule block", () => {
    const code = `.card {
  color: #075854;
  padding: 1rem;
}
@media (max-width: 600px) {
  .card { padding: 0.5rem; }
}`;
    expect(detectFenceLanguage(code)).toBe("css");
  });

  it("detects YAML mapping", () => {
    const code = `---
name: build
on:
  push:
    branches:
      - main`;
    expect(detectFenceLanguage(code)).toBe("yaml");
  });

  it("detects a bash script", () => {
    const code = `#!/usr/bin/env bash
cd /tmp
npm install
export NODE_ENV=production
echo "done $HOME"`;
    expect(detectFenceLanguage(code)).toBe("bash");
  });

  it("detects python", () => {
    const code = `import os

def greet(name):
    print(f"hello {name}")

class Foo:
    def bar(self):
        return 1`;
    expect(detectFenceLanguage(code)).toBe("python");
  });

  it("detects SQL", () => {
    const code = `SELECT id, name FROM users
WHERE active = 1
ORDER BY created_at DESC;`;
    expect(detectFenceLanguage(code)).toBe("sql");
  });

  it("returns null for ambiguous prose", () => {
    const code = `This is just a paragraph of plain English describing how the booking
flow works, with no code in it whatsoever.`;
    expect(detectFenceLanguage(code)).toBeNull();
  });

  it("returns null for trivially short input", () => {
    expect(detectFenceLanguage("hi")).toBeNull();
    expect(detectFenceLanguage("   ")).toBeNull();
  });

  it("returns null for an adversarial near-miss (single keyword)", () => {
    // One lonely keyword should not clear the score floor + margin.
    expect(detectFenceLanguage("return value")).toBeNull();
  });
});
