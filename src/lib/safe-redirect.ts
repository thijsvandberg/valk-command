// Validates a post-login redirect target read from an untrusted `redirect_url`
// query param. Only same-origin absolute paths are allowed; anything that could
// send the user to another origin (protocol-relative `//host`, a backslash
// variant, or an absolute URL) falls back to the home route. This is the guard
// that lets the middleware safely round-trip a deep-link through the login page.

const HOME = "/";

export function safeRedirectPath(raw: string | null | undefined): string {
  if (!raw) return HOME;
  // Must be a path on this origin: a single leading slash, no scheme.
  if (!raw.startsWith("/")) return HOME;
  // "//host" and "/\host" are protocol-relative / browser-normalised external
  // targets, not local paths.
  if (raw.startsWith("//") || raw.startsWith("/\\")) return HOME;
  // Reject control characters and whitespace that could smuggle a second target.
  if (/[\x00-\x1f\x7f\s]/.test(raw)) return HOME;
  return raw;
}
