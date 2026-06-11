// Staggered reveal for the nav panel's views: each child eases in once `open`,
// ordered top-to-bottom. Limited to transform + opacity so it stays on the
// compositor (BRDG-317). Lives in its own module so the panel's flip-views can
// share it without dragging in the full NavPanel import graph.
export function revealStyle(open: boolean, i: number): React.CSSProperties {
  return {
    opacity: open ? 1 : 0,
    transform: open ? "translateY(0)" : "translateY(8px)",
    transition: "opacity 260ms ease, transform 260ms cubic-bezier(0.34,1.56,0.64,1)",
    transitionDelay: open ? `${60 + i * 45}ms` : "0ms",
  };
}
