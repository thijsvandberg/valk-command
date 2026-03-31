/**
 * Generates a markdown representation of a diff between two text versions
 * and triggers a browser download.
 */
export function exportDiffAsMarkdown({
  ticketKey,
  oldText,
  newText,
  oldLabel,
  newLabel,
}: {
  ticketKey: string;
  oldText: string;
  newText: string;
  oldLabel: string;
  newLabel: string;
}): void {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  const lines: string[] = [
    `# Diff: ${ticketKey}`,
    "",
    `**${oldLabel}** -> **${newLabel}**`,
    `*Exported: ${new Date().toISOString()}*`,
    "",
    "---",
    "",
    `## ${oldLabel} (Previous)`,
    "",
    "```",
    ...oldLines,
    "```",
    "",
    `## ${newLabel} (Current)`,
    "",
    "```",
    ...newLines,
    "```",
    "",
  ];

  // Simple line-level diff section
  const maxLen = Math.max(oldLines.length, newLines.length);
  const diffLines: string[] = ["## Changes", ""];

  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine === newLine) {
      diffLines.push(`  ${oldLine}`);
    } else {
      if (oldLine !== undefined) {
        diffLines.push(`- ${oldLine}`);
      }
      if (newLine !== undefined) {
        diffLines.push(`+ ${newLine}`);
      }
    }
  }

  lines.push(...diffLines);

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${ticketKey}-diff-${oldLabel}-${newLabel}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
