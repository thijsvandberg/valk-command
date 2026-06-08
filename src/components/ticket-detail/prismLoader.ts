import Prism from "prismjs";
import { detectFenceLanguage } from "./detectLanguage";

const PRISM_LANG_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  html: "markup",
  xml: "markup",
  cs: "csharp",
  yml: "yaml",
};

// Supported Prism language component names
const SUPPORTED_LANGUAGES = new Set([
  "typescript", "javascript", "jsx", "tsx", "php", "python", "sql", "bash",
  "css", "markup", "json", "java", "ruby", "go", "rust", "csharp", "yaml",
  "kotlin", "swift", "scss",
]);

const loaded = new Set<string>();
const inflight = new Map<string, Promise<void>>();

// Bumped whenever a NEW grammar becomes available to Prism. renderMarkdown folds
// this into its LRU cache key so a tree cached before a grammar loaded (plain
// text) is not served back after the grammar arrives (BRDG-316).
let loadedGeneration = 0;
export function getLoadedGeneration(): number {
  return loadedGeneration;
}

function resolveLang(lang: string): string {
  const lower = lang.toLowerCase();
  return PRISM_LANG_ALIASES[lower] ?? lower;
}

async function loadLang(lang: string): Promise<void> {
  if (loaded.has(lang) || Prism.languages[lang]) {
    loaded.add(lang);
    return;
  }
  if (!SUPPORTED_LANGUAGES.has(lang)) return;

  if (inflight.has(lang)) {
    await inflight.get(lang);
    return;
  }

  const promise = import(
    /* webpackInclude: /prism-(typescript|javascript|jsx|tsx|php|python|sql|bash|css|markup|json|java|ruby|go|rust|csharp|yaml|kotlin|swift|scss)\.js$/ */
    `prismjs/components/prism-${lang}`
  ).then(() => {
    loaded.add(lang);
    loadedGeneration++;
    inflight.delete(lang);
  });
  inflight.set(lang, promise);
  await promise;
}

// Scan markdown for fenced code block languages. Tagged fences (```lang) use the
// tag verbatim; bare ``` fences are run through content-based detection so their
// inferred grammar is preloaded too (BRDG-316). Walks fences line-by-line so the
// pairing matches renderMarkdown's parser exactly.
export function extractCodeLanguages(markdown: string): string[] {
  const langs = new Set<string>();
  let inFence = false;
  let tag = "";
  let body: string[] = [];

  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) {
      if (inFence) {
        if (tag) {
          langs.add(resolveLang(tag));
        } else {
          // detectFenceLanguage returns an already-resolved grammar key or null.
          const detected = detectFenceLanguage(body.join("\n"));
          if (detected) langs.add(detected);
        }
        inFence = false;
        tag = "";
        body = [];
      } else {
        inFence = true;
        tag = line.slice(3).trim();
        body = [];
      }
    } else if (inFence) {
      body.push(line);
    }
  }
  return [...langs];
}

// Load all required languages and return true if any new ones were loaded
export async function ensureLanguages(langs: string[]): Promise<boolean> {
  const needed = langs.filter((l) => !loaded.has(l) && SUPPORTED_LANGUAGES.has(l));
  if (needed.length === 0) return false;
  await Promise.all(needed.map(loadLang));
  return true;
}
