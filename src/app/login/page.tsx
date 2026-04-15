import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-base)] px-4">
      <SignIn
        appearance={{
          variables: {
            colorBackground: "var(--color-surface-elevated)",
            colorText: "rgba(255,255,255,0.9)",
            colorTextSecondary: "rgba(255,255,255,0.4)",
            colorPrimary: "var(--color-brand-600)",
            colorInputBackground: "rgba(255,255,255,0.03)",
            colorInputText: "rgba(255,255,255,0.9)",
            borderRadius: "0.75rem",
          },
          elements: {
            card: "shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-white/[0.06]",
            headerTitle: "font-[var(--font-display)] tracking-[-0.03em]",
          },
        }}
      />
    </div>
  );
}
