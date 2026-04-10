"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/setup")
      .then((r) => r.json())
      .then((d) => setNeedsSetup(d.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (needsSetup && password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (needsSetup && password.length < 8) {
      setError("Password must be at least 8 characters");
      setLoading(false);
      return;
    }

    try {
      const endpoint = needsSetup ? "/api/auth/setup" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Authentication failed");
        setLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  if (needsSetup === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-base)]">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-[var(--color-brand-400)]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-base)] px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-white/[0.06] bg-[var(--color-surface-elevated)] p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <div className="mb-8 text-center">
            <h1 className="font-[var(--font-display)] text-xl font-semibold tracking-[-0.03em] text-white/90">
              {needsSetup ? "Set Up Bridge" : "Bridge"}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/40 font-[var(--font-body)]">
              {needsSetup
                ? "Create a password to secure your instance."
                : "Enter your password to continue."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-medium text-white/50"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
                minLength={needsSetup ? 8 : 1}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-white/90 placeholder:text-white/20 transition-colors duration-150 focus:border-[var(--color-brand-500)]/40 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]/30"
                placeholder={needsSetup ? "Min. 8 characters" : ""}
              />
            </div>

            {needsSetup && (
              <div>
                <label
                  htmlFor="confirm-password"
                  className="mb-1.5 block text-xs font-medium text-white/50"
                >
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-white/90 placeholder:text-white/20 transition-colors duration-150 focus:border-[var(--color-brand-500)]/40 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]/30"
                />
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 h-10 w-full rounded-lg bg-[var(--color-brand-600)] text-sm font-medium text-white shadow-[0_2px_8px_rgba(26,111,194,0.30)] transition-colors duration-150 cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  {needsSetup ? "Setting up..." : "Signing in..."}
                </span>
              ) : needsSetup ? (
                "Create Password"
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
