// Shared content-width cap for wide screens (BRDG-361). Centers list/table views
// and the app chrome header on monitors wider than the cap so rows and controls
// stop drifting edge-to-edge. 1536px equals the value of the old Tailwind v3
// `max-w-screen-2xl`, which Tailwind v4 removed, hence the explicit arbitrary value.
export const CONTENT_MAX = "mx-auto w-full max-w-[1536px]";
