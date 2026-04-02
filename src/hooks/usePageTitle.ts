import { useEffect } from "react";

const SUFFIX = " | Valk Command";

/**
 * Sets document.title for client components.
 * Server components should use `export const metadata` instead.
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title + SUFFIX;
  }, [title]);
}
