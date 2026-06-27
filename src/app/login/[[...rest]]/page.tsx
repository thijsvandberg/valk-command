"use client";

import { SignIn, useAuth, useOrganizationList, useClerk } from "@clerk/nextjs";
import { useEffect, useState } from "react";

const BRIDGE_ORG_ID = process.env.NEXT_PUBLIC_CLERK_ORG_ID;

export default function LoginPage() {
  const { isSignedIn, orgId, isLoaded } = useAuth();
  const { setActive, isLoaded: orgListLoaded } = useOrganizationList();
  const { signOut } = useClerk();
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    if (!isLoaded || !orgListLoaded) return;
    if (!isSignedIn) return;

    // Already in the right org — go home
    if (orgId === BRIDGE_ORG_ID) {
      window.location.href = "/";
      return;
    }

    // Try to switch to the Bridge org
    if (BRIDGE_ORG_ID && setActive) {
      setActive({ organization: BRIDGE_ORG_ID })
        .then(() => {
          // Hard reload so the middleware reads the updated session cookie
          window.location.href = "/";
        })
        .catch(() => {
          // User is logged in but not a member of the Bridge org
          setAccessDenied(true);
        });
    }
  }, [isLoaded, orgListLoaded, isSignedIn, orgId, setActive]);

  // While Clerk is initializing, show a spinner
  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-base)]">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border-default border-t-[var(--color-brand-400)]" />
      </div>
    );
  }

  // Signed in but not a member of this Clerk org
  if (accessDenied) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-base)] px-4">
        <div className="w-full max-w-sm rounded-xl border border-border-default bg-[var(--color-surface-elevated)] p-8 shadow-[var(--shadow-lg)]">
          <div className="mb-6 text-center">
            <h1 className="font-[var(--font-display)] text-heading font-semibold tracking-[-0.03em] text-text-primary">
              Access denied
            </h1>
            <p className="mt-2 text-body-lg leading-relaxed text-text-tertiary">
              Your account is not a member of the Bridge organization. Contact
              the admin to get access.
            </p>
          </div>
          <button
            type="button"
            onClick={() => signOut({ redirectUrl: "/login" })}
            className="h-10 w-full cursor-pointer rounded-lg border border-border-strong bg-overlay-subtle text-body-lg text-text-secondary transition-colors duration-150 hover:bg-overlay-default hover:text-text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Signed in and switching org — show spinner
  if (isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-base)]">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border-default border-t-[var(--color-brand-400)]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-base)] px-4">
      <SignIn
        appearance={{
          variables: {
            colorBackground: "var(--color-surface-elevated)",
            colorText: "var(--color-text-primary)",
            colorTextSecondary: "var(--color-text-tertiary)",
            colorPrimary: "var(--color-brand-600)",
            colorInputBackground: "var(--color-overlay-subtle)",
            colorInputText: "var(--color-text-primary)",
            borderRadius: "0.75rem",
          },
          elements: {
            card: "shadow-[var(--shadow-lg)] border border-border-default",
            headerTitle: "font-[var(--font-display)] tracking-[-0.03em]",
          },
        }}
      />
    </div>
  );
}
