// One shared message for the error-boundary screens (BRDG-423). Previously
// error.tsx, global-error.tsx and ErrorBoundary.tsx each carried a slightly
// different heading + body. They now read identically wherever a render crash
// is caught.

export const ERROR_BOUNDARY_TITLE = "Something went wrong";

export const ERROR_BOUNDARY_MESSAGE =
  "An unexpected error occurred. Try again, or reload the page if the problem persists.";
