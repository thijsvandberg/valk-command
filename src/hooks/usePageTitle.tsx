import React from "react";

const SUFFIX = " | Valk Command";

/**
 * Returns a <title> element to render in the component tree.
 * React 19 hoists <title> elements to <head>, which correctly overrides
 * the layout default without the document.title / React reconciliation conflict
 * that caused the title to reset to "Valk Command" on re-renders.
 */
export function usePageTitle(title: string): React.ReactElement {
  return <title>{title + SUFFIX}</title>;
}
