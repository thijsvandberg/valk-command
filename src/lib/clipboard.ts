import { marked } from "marked";

/**
 * Copy raw markdown text to the clipboard.
 */
export async function copyAsMarkdown(markdown: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(markdown);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy markdown as rich text (HTML) to the clipboard.
 * Puts both text/html and text/plain on the clipboard so the paste
 * target gets the best format it supports.
 */
export async function copyAsRTF(markdown: string): Promise<boolean> {
  try {
    const html = await marked(markdown);
    const htmlBlob = new Blob([html], { type: "text/html" });
    const textBlob = new Blob([markdown], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": textBlob,
      }),
    ]);
    return true;
  } catch {
    // Fallback to plain text if ClipboardItem is not supported
    return copyAsMarkdown(markdown);
  }
}
