#!/usr/bin/env node

/**
 * Generates src/data/changelog.json from git history.
 * Parses conventional commits and produces PO-friendly descriptions.
 *
 * Usage: node tools/scripts/generate-changelog.mjs
 */

import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const OUTPUT = resolve(ROOT, "src/data/changelog.json");

const REPO_URL = "https://github.com/thijsvandberg/valk-command";

const CATEGORY_MAP = {
  feat: "New",
  fix: "Fixed",
  chore: "Maintenance",
  docs: "Documentation",
  refactor: "Improved",
  test: "Testing",
  style: "Styling",
  perf: "Performance",
  ci: "CI/CD",
  build: "Build",
};

const RECORD_SEP = "---CHANGELOG-RECORD---";
const FIELD_SEP = "---FIELD---";

function getGitLog() {
  try {
    const format = ["%H", "%h", "%s", "%b", "%an", "%aI"].join(FIELD_SEP);
    const raw = execSync(
      `git log --format="${format}${RECORD_SEP}" --first-parent`,
      { cwd: ROOT, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
    );
    return raw.trim();
  } catch {
    return "";
  }
}

function parseConventionalCommit(subject) {
  const match = subject.match(
    /^(\w+?)(?:\(.+?\))?(!)?:\s*(.+?)(?:\s*\(#\d+\))?$/,
  );
  if (match) {
    const [, type, , description] = match;
    return {
      type: type.toLowerCase(),
      description: description.charAt(0).toUpperCase() + description.slice(1),
    };
  }
  return {
    type: "other",
    description: subject.charAt(0).toUpperCase() + subject.slice(1),
  };
}

function makePOFriendly(description) {
  return description
    .replace(/\bCLAUDE\.md\b/g, "project configuration")
    .replace(/\bCI\b/g, "automated checks")
    .replace(/\bVitest\b/gi, "testing framework")
    .replace(/\bESLint\b/gi, "code quality tools")
    .replace(/\bDrizzle\b/gi, "database layer")
    .replace(/\bORM\b/gi, "database layer")
    .replace(/\btsconfig\b/gi, "TypeScript settings")
    .replace(/\bwebhook(s)?\b/gi, "automated notification$1")
    .replace(/\bSSE\b/g, "live updates")
    .replace(/\bAPI\b/g, "integration")
    .replace(/\bMCP\b/g, "tool connection");
}

function shouldInclude(type) {
  const excluded = new Set(["ci", "build", "style"]);
  return !excluded.has(type);
}

function generateChangelog() {
  const raw = getGitLog();
  if (!raw) {
    console.log("No git history found. Writing empty changelog.");
    mkdirSync(dirname(OUTPUT), { recursive: true });
    writeFileSync(OUTPUT, JSON.stringify([], null, 2) + "\n");
    return;
  }

  const commits = raw.split(RECORD_SEP).filter((s) => s.trim());
  const entries = [];

  for (const block of commits) {
    const parts = block.trim().split(FIELD_SEP);
    if (parts.length < 6) continue;

    const [hash, shortHash, subject, body, author, isoDate] = parts;

    if (!hash || !subject) continue;

    const { type, description } = parseConventionalCommit(subject);

    if (!shouldInclude(type)) continue;

    const category = CATEGORY_MAP[type] || "Other";
    const poDescription = makePOFriendly(description);

    const cleanBody = body
      .split("\n")
      .filter(
        (l) =>
          l.trim() &&
          !l.startsWith("Co-Authored") &&
          !l.startsWith("Closes #") &&
          !l.startsWith("Fixes #"),
      )
      .map((l) => l.replace(/^\*\s*\w+(\(.+?\))?:\s*/, "").trim())
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);

    const longDescription =
      cleanBody.length > 20 ? makePOFriendly(cleanBody) : undefined;

    const date = isoDate.split("T")[0];

    entries.push({
      hash,
      shortHash,
      date,
      category,
      description: poDescription,
      longDescription,
      author,
      commitUrl: `${REPO_URL}/commit/${hash}`,
    });
  }

  const grouped = {};
  for (const entry of entries) {
    if (!grouped[entry.date]) {
      grouped[entry.date] = [];
    }
    grouped[entry.date].push(entry);
  }

  const changelog = Object.keys(grouped)
    .sort((a, b) => b.localeCompare(a))
    .map((date) => ({
      date,
      entries: grouped[date],
    }));

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(changelog, null, 2) + "\n");
  console.log(
    `Changelog generated: ${entries.length} entries across ${changelog.length} dates`,
  );
}

generateChangelog();
