import React, { useEffect } from "react";

export const PAGE_TITLE_SUFFIX = " | Bridge";

/**
 * Sets the page title via both React 19 <title> hoisting (initial render)
 * and document.title (useEffect) to prevent Next.js navigation transitions
 * from briefly resetting the title to the layout default.
 */
export function usePageTitle(title: string): React.ReactElement {
  const fullTitle = title + PAGE_TITLE_SUFFIX;

  useEffect(() => {
    document.title = fullTitle;
  }, [fullTitle]);

  return <title>{fullTitle}</title>;
}
