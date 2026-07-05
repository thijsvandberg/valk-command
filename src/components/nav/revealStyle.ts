// Staggered reveal for the nav panel's views: each child eases in once `open`,
// ordered top-to-bottom. Limited to transform + opacity so it stays on the
// compositor (BRDG-317). Lives in its own module so the panel's flip-views can
// share it without dragging in the full NavPanel import graph.
// Cap the cumulative stagger so a long list does not keep popping in for half a
// second after it opens (BRDG-355): past this point every remaining row reveals
// together, so the list feels instant instead of cascading.
const MAX_STAGGER_MS = 300;

export function revealStyle(open: boolean, i: number): React.CSSProperties {
  return {
    opacity: open ? 1 : 0,
    transform: open ? "translateY(0)" : "translateY(8px)",
    transition: "opacity 260ms ease, transform 260ms cubic-bezier(0.34,1.56,0.64,1)",
    transitionDelay: open ? `${Math.min(60 + i * 45, MAX_STAGGER_MS)}ms` : "0ms",
  };
}
