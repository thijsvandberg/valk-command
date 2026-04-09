import React, { useEffect } from "react";

const SUFFIX = " | Bridge";

/**
 * Sets the page title via both React 19 <title> hoisting (initial render)
 * and document.title (useEffect) to prevent Next.js navigation transitions
 * from briefly resetting the title to the layout default.
 */
export function usePageTitle(title: string): React.ReactElement {
  const fullTitle = title + SUFFIX;

  useEffect(() => {
    document.title = fullTitle;
  }, [fullTitle]);

  return <title>{fullTitle}</title>;
}
