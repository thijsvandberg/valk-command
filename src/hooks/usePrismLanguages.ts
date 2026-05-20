import { useState, useEffect } from "react";
import { extractCodeLanguages, ensureLanguages } from "@/components/ticket-detail/prismLoader";

// Triggers dynamic Prism language loading for fenced code blocks in markdown.
// Returns a key that increments when new languages become available, so the
// parent can re-render to apply syntax highlighting.
export function usePrismLanguages(markdown: string | undefined | null): number {
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!markdown) return;
    const langs = extractCodeLanguages(markdown);
    if (langs.length === 0) return;

    let cancelled = false;
    ensureLanguages(langs).then((loaded) => {
      if (!cancelled && loaded) setGeneration((g) => g + 1);
    });
    return () => { cancelled = true; };
  }, [markdown]);

  return generation;
}
