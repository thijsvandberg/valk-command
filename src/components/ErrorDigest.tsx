"use client";

import { useState } from "react";

// Small, copyable error digest shown under the "Try again" button on the error
// screens (BRDG-398). Next.js attaches the same `digest` to the matching server
// log line, so surfacing it lets the user quote a reference a dev can grep for.
// Renders nothing when there is no digest (client-side React errors often lack
// one). Kept deliberately minimal so it reads as a footnote, not a second CTA.
export function ErrorDigest({ digest }: { digest?: string }) {
  const [copied, setCopied] = useState(false);

  if (!digest) return null;

  function copy() {
    if (!digest) return;
    navigator.clipboard?.writeText(digest).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      },
      () => {
        // Clipboard can be blocked (no permission / insecure context); the
        // digest is still visible to read manually, so fail quietly.
      },
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy error reference"
      className="group inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border-default bg-overlay-subtle px-2 py-1 font-mono text-label text-text-tertiary transition-colors duration-150 hover:border-border-strong hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
    >
      <span className="text-text-tertiary">Ref</span>
      <span className="select-all text-text-secondary">{digest}</span>
      <span className="text-text-tertiary group-hover:text-text-secondary">
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
