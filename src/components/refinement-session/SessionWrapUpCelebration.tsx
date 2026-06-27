"use client";

import { useState, useSyncExternalStore } from "react";
import { Sparkles } from "lucide-react";
import { useRefinementSession } from "@/contexts/RefinementSessionContext";
import { useTicketsByKeys } from "@/hooks/useSprintBoard";

/* Celebration layers around the refinement wrap-up modal (BRDG-341), ported
 * from /dev/exploration/session-ending variant J (corner cannons). Everything
 * here renders BEHIND or ABOVE the modal; SessionEndModal stays untouched so
 * pausing via Save feels as appropriate as completing. */

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/* Fixed festive palette: brand teal plus light-teal, gold, violet and rose
 * accents. The non-token hexes are intentional — confetti reads as confetti
 * in both themes precisely because it is not theme-tinted. */
const CONFETTI_TONES = ["var(--color-brand-400)", "#7fd9d4", "#d9a441", "#9d7bdd", "#dd7e9b"];

/** Deterministic pseudo-random so SSR and client render the same particles.
 *  Rounded to 2 decimals: the SSR HTML serializer trims float precision, so
 *  full-precision values would hydration-mismatch against the client. */
function seededRand(i: number, salt: number) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return Math.round((x - Math.floor(x)) * 100) / 100;
}

function subscribeReducedMotion(callback: () => void) {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

/** Read via useSyncExternalStore instead of state+effect: the React Compiler
 *  lint forbids setState-in-effect, and this also avoids a one-frame flash of
 *  cannons for reduced-motion users. */
function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/** Layered teal gradient field rising from the bottom of the page, with an
 *  SVG grain overlay for depth. Fades in on arrival, then sits still. */
function AuroraField() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(110% 70% at 50% 115%, color-mix(in srgb, var(--color-brand-600) 30%, transparent) 0%, transparent 60%), radial-gradient(60% 45% at 12% 105%, color-mix(in srgb, #7fd9d4 9%, transparent) 0%, transparent 55%), radial-gradient(60% 45% at 88% 105%, color-mix(in srgb, var(--color-brand-500) 12%, transparent) 0%, transparent 55%)",
          animation: "wrapupFadeIn 1s ease-out both",
        }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: GRAIN }} />
    </>
  );
}

/** Soft brand-teal bloom behind the modal; fades in, then breathes slowly.
 *  The breathing loop is frozen by the reduced-motion media query in
 *  globals.css, leaving a static halo. */
function AmbientHalo() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[620px] rounded-full"
      style={{
        background:
          "radial-gradient(closest-side, color-mix(in srgb, var(--color-brand-500) 22%, transparent) 0%, transparent 70%)",
        animation: "wrapupFadeIn 0.9s ease-out both, wrapupBreath 5.5s ease-in-out 0.9s infinite",
        transform: "translate(-50%, -50%)",
      }}
    />
  );
}

const CANNON_PIECES_PER_SIDE = 20;

/** One corner cannon: a one-shot confetti burst fired diagonally up from a
 *  bottom corner. Gone in under two seconds; frames the modal, never covers it. */
function CannonSide({ side }: { side: "left" | "right" }) {
  const mirror = side === "right" ? -1 : 1;
  const salt = side === "right" ? 40 : 20;
  return (
    <>
      {Array.from({ length: CANNON_PIECES_PER_SIDE }, (_, i) => {
        const angle = ((20 + seededRand(i, salt + 1) * 52) * Math.PI) / 180;
        const dist = 180 + seededRand(i, salt + 2) * 300;
        const dx = (Math.cos(angle) * dist * mirror).toFixed(2);
        const dy = (-Math.sin(angle) * dist).toFixed(2);
        const dur = (1.1 + seededRand(i, salt + 3) * 0.7).toFixed(2);
        const delay = (seededRand(i, salt + 4) * 0.18).toFixed(2);
        const spin = Math.round((seededRand(i, salt + 5) - 0.5) * 1440);
        const w = (5 + seededRand(i, salt + 6) * 3).toFixed(2);
        const h = (10 + seededRand(i, salt + 7) * 5).toFixed(2);
        return (
          <span
            key={i}
            aria-hidden
            data-testid="wrapup-confetti-piece"
            className="pointer-events-none absolute"
            style={
              {
                left: side === "left" ? "-6px" : undefined,
                right: side === "right" ? "-6px" : undefined,
                bottom: "-6px",
                width: `${w}px`,
                height: `${h}px`,
                borderRadius: "1.5px",
                background: CONFETTI_TONES[i % CONFETTI_TONES.length],
                "--dx": `${dx}px`,
                "--dy": `${dy}px`,
                "--spin": `${spin}deg`,
                animation: `wrapupCannon ${dur}s cubic-bezier(0.16, 0.84, 0.44, 1) ${delay}s both`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </>
  );
}

export function SessionWrapUpCelebration({ children }: { children: React.ReactNode }) {
  const { queue, sessionEstimates, sessionStartedAt } = useRefinementSession();
  // Scope to the session's queue rather than loading the whole backlog (BRDG-387).
  const allTickets = useTicketsByKeys(queue);
  const reducedMotion = useReducedMotion();

  // Session estimates take precedence over the shared ticket cache, matching
  // SessionEndModal's ticketRows: the cache can still hold the pre-session
  // value while the save is in flight.
  const totalPoints = queue.reduce((sum, key) => {
    const ticket = allTickets?.find((t) => t.key === key);
    const points = key in sessionEstimates ? sessionEstimates[key] : ticket?.storyPoints ?? null;
    return sum + (points ?? 0);
  }, 0);

  // Captured once on mount so the line doesn't tick while the user writes
  // notes. Null when the session start is unknown (e.g. resumed after reload).
  const [durationMin] = useState(() =>
    sessionStartedAt == null ? null : Math.max(1, Math.round((Date.now() - sessionStartedAt) / 60000)),
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <AuroraField />
      <AmbientHalo />
      {!reducedMotion && (
        <>
          <CannonSide side="left" />
          <CannonSide side="right" />
        </>
      )}

      <div
        className="relative flex shrink-0 flex-col items-center gap-0.5 px-6 pt-10"
        style={{ animation: "wrapupFadeUp 0.45s ease-out 150ms both" }}
      >
        <p className="flex items-center gap-2 font-display text-[22px] font-bold tracking-[-0.02em] text-text-primary">
          <Sparkles size={17} strokeWidth={2} className="text-[var(--color-brand-400)]" />
          Queue cleared
        </p>
        <p className="text-body-sm text-text-tertiary">
          {queue.length} ticket{queue.length !== 1 ? "s" : ""} refined · {totalPoints} points
          {durationMin != null && (
            <> · {durationMin} minute{durationMin !== 1 ? "s" : ""}</>
          )}{" "}
          — wrap up below
        </p>
      </div>

      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}
