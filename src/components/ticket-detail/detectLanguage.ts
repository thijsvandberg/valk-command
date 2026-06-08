// Content-based language detection for code fences pasted WITHOUT a language tag
// (BRDG-316). renderMarkdown only highlights when a grammar is known, so a bare
// ``` fence renders as flat text. This infers a grammar from the snippet so the
// common JS/JSON/HTML/CSS/bash/yaml/python/sql cases get highlighted.
//
// The function is pure and deterministic so it can be used in BOTH the Prism
// preload scan (prismLoader.extractCodeLanguages) and the highlight path
// (renderMarkdown.renderCodeBlock): the grammar preloaded is then provably the
// one used to highlight. It is deliberately CONSERVATIVE: ambiguous or low-signal
// content returns null, so we never confidently mis-colour a snippet.

// All returned values are Prism grammar keys that prismLoader can load.
type Candidate =
  | "json"
  | "javascript"
  | "markup"
  | "css"
  | "bash"
  | "yaml"
  | "python"
  | "sql";

// A scoring win needs both an absolute floor and a clear lead over the runner-up,
// otherwise the snippet is too ambiguous to claim a language.
const MIN_SCORE = 3;
const MIN_MARGIN = 2;

function countMatches(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

// JSON is the one near-deterministic signal: a body that parses as a JSON
// object/array is almost certainly JSON, not JS (JS object literals with unquoted
// keys, comments, or trailing function calls fail JSON.parse).
function looksLikeJson(trimmed: string): boolean {
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return false;
  if (!(trimmed.endsWith("}") || trimmed.endsWith("]"))) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function scoreJavascript(code: string): number {
  let s = 0;
  s += countMatches(code, /\b(?:const|let|var|function|return|await|async|typeof|new)\b/g);
  s += countMatches(code, /=>/g);
  s += countMatches(code, /\b(?:window|document|console)\.\w/g) * 2;
  s += countMatches(code, /^\s*\/\//gm); // line comments
  s += countMatches(code, /===|!==|&&|\|\|/g);
  s += countMatches(code, /\.\w+\(/g); // method calls
  s += countMatches(code, /;\s*$/gm);
  return s;
}

function scoreMarkup(code: string): number {
  let s = 0;
  if (/<!DOCTYPE/i.test(code)) s += 4;
  // Paired open/close tags are a much stronger signal than a lone <script>.
  s += countMatches(code, /<\/[a-z][\w-]*>/gi) * 2;
  s += countMatches(code, /<[a-z][\w-]*(?:\s[^<>]*)?>/gi);
  return s;
}

function scoreCss(code: string): number {
  // CSS-only: selector blocks with `prop: value;` and none of the JS giveaways.
  if (/\b(?:function|=>|const|let|var|return)\b/.test(code)) return 0;
  let s = 0;
  s += countMatches(code, /[.#]?[\w-]+\s*\{[^{}]*\}/g) * 2; // rule blocks
  s += countMatches(code, /[\w-]+\s*:\s*[^;{}]+;/g); // declarations
  s += countMatches(code, /@(?:media|import|keyframes|font-face)\b/g) * 2;
  return s;
}

function scoreBash(code: string): number {
  let s = 0;
  if (/^#!.*\b(?:sh|bash|zsh)\b/m.test(code)) s += 4;
  s += countMatches(code, /^\s*(?:sudo|npm|npx|yarn|pnpm|cd|ls|echo|export|git|curl|wget|chmod|mkdir|rm|cp|mv|cat|grep|docker|kubectl)\b/gm) * 2;
  s += countMatches(code, /\$\{?\w+\}?/g);
  s += countMatches(code, /\$\(/g) * 2;
  return s;
}

function scoreYaml(code: string): number {
  // YAML and JS objects both use `key: value`; disqualify on braces/semicolons.
  if (/[{};]/.test(code)) return 0;
  let s = 0;
  if (/^---\s*$/m.test(code)) s += 3;
  s += countMatches(code, /^[\w-]+:\s+\S/gm) * 2; // mapping entries
  s += countMatches(code, /^\s*-\s+\S/gm); // sequence items
  return s;
}

function scorePython(code: string): number {
  let s = 0;
  s += countMatches(code, /^\s*(?:def|class)\s+\w+/gm) * 2;
  s += countMatches(code, /^\s*(?:import\s+\w|from\s+\w[\w.]*\s+import)\b/gm) * 2;
  s += countMatches(code, /\bprint\(/g);
  s += countMatches(code, /:\s*$/gm); // block headers
  s += countMatches(code, /\bself\b/g);
  return s;
}

function scoreSql(code: string): number {
  let s = 0;
  s += countMatches(code, /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b/gi) * 2;
  s += countMatches(code, /\b(?:FROM|WHERE|JOIN|GROUP\s+BY|ORDER\s+BY|HAVING|VALUES)\b/gi);
  return s;
}

export function detectFenceLanguage(code: string): string | null {
  const trimmed = code.trim();
  if (trimmed.length < 6) return null; // too little signal to be confident

  if (looksLikeJson(trimmed)) return "json";

  const scores: Array<[Candidate, number]> = [
    ["javascript", scoreJavascript(code)],
    ["markup", scoreMarkup(code)],
    ["css", scoreCss(code)],
    ["bash", scoreBash(code)],
    ["yaml", scoreYaml(code)],
    ["python", scorePython(code)],
    ["sql", scoreSql(code)],
  ];

  scores.sort((a, b) => b[1] - a[1]);
  const [topLang, topScore] = scores[0];
  const runnerUp = scores[1]?.[1] ?? 0;

  if (topScore < MIN_SCORE) return null;
  if (topScore - runnerUp < MIN_MARGIN) return null;

  return topLang;
}
