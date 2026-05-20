import Prism from "prismjs";

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
    inflight.delete(lang);
  });
  inflight.set(lang, promise);
  await promise;
}

// Scan markdown for fenced code block languages (```lang)
const CODE_FENCE_RE = /^```(\w+)/gm;

export function extractCodeLanguages(markdown: string): string[] {
  const langs = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = CODE_FENCE_RE.exec(markdown)) !== null) {
    langs.add(resolveLang(match[1]));
  }
  CODE_FENCE_RE.lastIndex = 0;
  return [...langs];
}

// Load all required languages and return true if any new ones were loaded
export async function ensureLanguages(langs: string[]): Promise<boolean> {
  const needed = langs.filter((l) => !loaded.has(l) && SUPPORTED_LANGUAGES.has(l));
  if (needed.length === 0) return false;
  await Promise.all(needed.map(loadLang));
  return true;
}
