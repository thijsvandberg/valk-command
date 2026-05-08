"use client";

import { useState } from "react";
import {
  LayoutGrid,
  MessageCircle,
  KanbanSquare,
  Check,
  AlertTriangle,
  FlaskConical,
  ArrowRight,
  Search,
  Bell,
  Star,
  GitBranch,
  ChevronDown,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Color scheme definitions                                          */
/* ------------------------------------------------------------------ */

interface ColorScheme {
  id: string;
  name: string;
  description: string;
  dark: ThemeColors;
  light: ThemeColors;
}

interface ThemeColors {
  surfaceBase: string;
  surfaceElevated: string;
  surfaceFloating: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textMuted: string;
  borderDefault: string;
  borderStrong: string;
  overlaySubtle: string;
  overlayDefault: string;
  brand50: string;
  brand100: string;
  brand300: string;
  brand400: string;
  brand500: string;
  brand600: string;
  brand700: string;
  secondary400: string;
  secondary500: string;
  warning400: string;
  warning500: string;
  testing400: string;
  testing500: string;
}

const schemes: ColorScheme[] = [
  {
    id: "current",
    name: "Current: Steel Blue",
    description: "The existing scheme. Cool blue brand with teal secondary. Professional and calm.",
    dark: {
      surfaceBase: "#070b12",
      surfaceElevated: "#0c1219",
      surfaceFloating: "#131c28",
      textPrimary: "rgba(255,255,255,0.90)",
      textSecondary: "rgba(255,255,255,0.60)",
      textTertiary: "rgba(255,255,255,0.40)",
      textMuted: "rgba(255,255,255,0.25)",
      borderDefault: "rgba(255,255,255,0.06)",
      borderStrong: "rgba(255,255,255,0.08)",
      overlaySubtle: "rgba(255,255,255,0.04)",
      overlayDefault: "rgba(255,255,255,0.06)",
      brand50: "#e8f1fb",
      brand100: "#c4dcf5",
      brand300: "#5ea4e3",
      brand400: "#3389d8",
      brand500: "#1a6fc2",
      brand600: "#155a9e",
      brand700: "#10447a",
      secondary400: "#34d4a5",
      secondary500: "#18b88a",
      warning400: "#f59e0b",
      warning500: "#d97706",
      testing400: "#9b7ee8",
      testing500: "#7c3aed",
    },
    light: {
      surfaceBase: "#f5f6f8",
      surfaceElevated: "#ffffff",
      surfaceFloating: "#ffffff",
      textPrimary: "rgba(0,0,0,0.87)",
      textSecondary: "rgba(0,0,0,0.60)",
      textTertiary: "rgba(0,0,0,0.44)",
      textMuted: "rgba(0,0,0,0.28)",
      borderDefault: "rgba(0,0,0,0.10)",
      borderStrong: "rgba(0,0,0,0.14)",
      overlaySubtle: "rgba(0,0,0,0.03)",
      overlayDefault: "rgba(0,0,0,0.06)",
      brand50: "#e8f1fb",
      brand100: "#c4dcf5",
      brand300: "#5ea4e3",
      brand400: "#1a6fc2",
      brand500: "#155a9e",
      brand600: "#10447a",
      brand700: "#0c3259",
      secondary400: "#0f946e",
      secondary500: "#0b7358",
      warning400: "#d97706",
      warning500: "#b45309",
      testing400: "#7c3aed",
      testing500: "#6d28d9",
    },
  },
  {
    id: "slate-copper",
    name: "Slate & Copper",
    description: "Warm and grounded. Copper brand with sage accents. Feels refined and approachable.",
    dark: {
      surfaceBase: "#0c0b0f",
      surfaceElevated: "#13121a",
      surfaceFloating: "#1b1a24",
      textPrimary: "rgba(255,255,255,0.90)",
      textSecondary: "rgba(255,255,255,0.58)",
      textTertiary: "rgba(255,255,255,0.38)",
      textMuted: "rgba(255,255,255,0.22)",
      borderDefault: "rgba(255,255,255,0.06)",
      borderStrong: "rgba(255,255,255,0.09)",
      overlaySubtle: "rgba(255,255,255,0.03)",
      overlayDefault: "rgba(255,255,255,0.05)",
      brand50: "#fdf4ec",
      brand100: "#fae0c8",
      brand300: "#e4a56b",
      brand400: "#d4894a",
      brand500: "#bf6d2e",
      brand600: "#a25a22",
      brand700: "#7d4419",
      secondary400: "#7cb88a",
      secondary500: "#5a9968",
      warning400: "#f59e0b",
      warning500: "#d97706",
      testing400: "#a78bfa",
      testing500: "#8b5cf6",
    },
    light: {
      surfaceBase: "#f7f5f2",
      surfaceElevated: "#ffffff",
      surfaceFloating: "#ffffff",
      textPrimary: "rgba(0,0,0,0.87)",
      textSecondary: "rgba(0,0,0,0.58)",
      textTertiary: "rgba(0,0,0,0.42)",
      textMuted: "rgba(0,0,0,0.26)",
      borderDefault: "rgba(0,0,0,0.09)",
      borderStrong: "rgba(0,0,0,0.13)",
      overlaySubtle: "rgba(0,0,0,0.03)",
      overlayDefault: "rgba(0,0,0,0.06)",
      brand50: "#fdf4ec",
      brand100: "#fae0c8",
      brand300: "#d4894a",
      brand400: "#bf6d2e",
      brand500: "#a25a22",
      brand600: "#7d4419",
      brand700: "#5c3212",
      secondary400: "#3d8a4c",
      secondary500: "#2d7040",
      warning400: "#d97706",
      warning500: "#b45309",
      testing400: "#8b5cf6",
      testing500: "#7c3aed",
    },
  },
  {
    id: "ocean-teal",
    name: "Ocean Teal",
    description: "Fresh and focused. Shared #0e8e88 anchor across themes. Only the text shade shifts one step for contrast.",
    dark: {
      surfaceBase: "#070c0e",
      surfaceElevated: "#0b1316",
      surfaceFloating: "#111d22",
      textPrimary: "rgba(255,255,255,0.95)",
      textSecondary: "rgba(255,255,255,0.72)",
      textTertiary: "rgba(255,255,255,0.52)",
      textMuted: "rgba(255,255,255,0.36)",
      borderDefault: "rgba(255,255,255,0.06)",
      borderStrong: "rgba(255,255,255,0.08)",
      overlaySubtle: "rgba(255,255,255,0.04)",
      overlayDefault: "rgba(255,255,255,0.06)",
      brand50: "#e6f7f7",
      brand100: "#b3eae9",
      brand300: "#3bbfbe",
      brand400: "#14a8a3",
      brand500: "#0e8e88",
      brand600: "#0a736e",
      brand700: "#075854",
      secondary400: "#34d399",
      secondary500: "#10b981",
      warning400: "#f59e0b",
      warning500: "#d97706",
      testing400: "#9b7ee8",
      testing500: "#7c3aed",
    },
    light: {
      surfaceBase: "#f4f8f8",
      surfaceElevated: "#ffffff",
      surfaceFloating: "#ffffff",
      textPrimary: "rgba(0,0,0,0.90)",
      textSecondary: "rgba(0,0,0,0.66)",
      textTertiary: "rgba(0,0,0,0.50)",
      textMuted: "rgba(0,0,0,0.36)",
      borderDefault: "rgba(0,0,0,0.10)",
      borderStrong: "rgba(0,0,0,0.14)",
      overlaySubtle: "rgba(0,0,0,0.03)",
      overlayDefault: "rgba(0,0,0,0.06)",
      brand50: "#e6f7f7",
      brand100: "#b3eae9",
      brand300: "#14a8a3",
      brand400: "#0e8e88",
      brand500: "#0e8e88",
      brand600: "#0a736e",
      brand700: "#075854",
      secondary400: "#059669",
      secondary500: "#047857",
      warning400: "#d97706",
      warning500: "#b45309",
      testing400: "#7c3aed",
      testing500: "#6d28d9",
    },
  },
  {
    id: "night-indigo",
    name: "Night Indigo",
    description: "Deep and focused. Rich indigo brand with emerald success cues. Modern dev-tool aesthetic.",
    dark: {
      surfaceBase: "#09090f",
      surfaceElevated: "#0f0f18",
      surfaceFloating: "#161622",
      textPrimary: "rgba(255,255,255,0.90)",
      textSecondary: "rgba(255,255,255,0.58)",
      textTertiary: "rgba(255,255,255,0.38)",
      textMuted: "rgba(255,255,255,0.22)",
      borderDefault: "rgba(255,255,255,0.06)",
      borderStrong: "rgba(255,255,255,0.09)",
      overlaySubtle: "rgba(255,255,255,0.03)",
      overlayDefault: "rgba(255,255,255,0.05)",
      brand50: "#eef0ff",
      brand100: "#d4d8ff",
      brand300: "#8b8eff",
      brand400: "#6c6bef",
      brand500: "#5652d9",
      brand600: "#4540b8",
      brand700: "#36328f",
      secondary400: "#34d9a0",
      secondary500: "#10b981",
      warning400: "#fbbf24",
      warning500: "#f59e0b",
      testing400: "#c084fc",
      testing500: "#a855f7",
    },
    light: {
      surfaceBase: "#f6f6f9",
      surfaceElevated: "#ffffff",
      surfaceFloating: "#ffffff",
      textPrimary: "rgba(0,0,0,0.87)",
      textSecondary: "rgba(0,0,0,0.58)",
      textTertiary: "rgba(0,0,0,0.42)",
      textMuted: "rgba(0,0,0,0.26)",
      borderDefault: "rgba(0,0,0,0.09)",
      borderStrong: "rgba(0,0,0,0.13)",
      overlaySubtle: "rgba(0,0,0,0.03)",
      overlayDefault: "rgba(0,0,0,0.06)",
      brand50: "#eef0ff",
      brand100: "#d4d8ff",
      brand300: "#6c6bef",
      brand400: "#5652d9",
      brand500: "#4540b8",
      brand600: "#36328f",
      brand700: "#282569",
      secondary400: "#059669",
      secondary500: "#047857",
      warning400: "#f59e0b",
      warning500: "#d97706",
      testing400: "#a855f7",
      testing500: "#9333ea",
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Element preview components                                        */
/* ------------------------------------------------------------------ */

function PreviewCard({ colors, mode }: { colors: ThemeColors; mode: "dark" | "light" }) {
  const s = (prop: keyof ThemeColors) => colors[prop];

  return (
    <div
      className="flex flex-col gap-4 rounded-2xl p-5 min-w-[340px] flex-1"
      style={{ background: s("surfaceBase"), color: s("textPrimary") }}
    >
      {/* Header label */}
      <div className="flex items-center justify-between">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: s("textTertiary") }}
        >
          {mode}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: s("overlayDefault"), color: s("textSecondary") }}
        >
          Preview
        </span>
      </div>

      {/* Surface card */}
      <div
        className="rounded-xl p-4 flex flex-col gap-3"
        style={{ background: s("surfaceElevated"), border: `1px solid ${s("borderDefault")}` }}
      >
        {/* Text hierarchy */}
        <div className="flex flex-col gap-1">
          <span className="font-[var(--font-display)] text-[15px] font-semibold tracking-[-0.02em]" style={{ color: s("textPrimary") }}>
            Sprint Board
          </span>
          <span className="text-[12px]" style={{ color: s("textSecondary") }}>
            Active sprint with 24 tickets across 4 statuses
          </span>
          <span className="text-[11px]" style={{ color: s("textTertiary") }}>
            Updated 3 minutes ago
          </span>
        </div>

        {/* Buttons row */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-white cursor-default"
            style={{ background: s("brand600") }}
          >
            <ArrowRight size={12} /> Primary
          </button>
          <button
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium cursor-default"
            style={{ background: `${s("brand500")}1a`, color: s("brand400"), border: `1px solid ${s("brand500")}40` }}
          >
            <Star size={12} /> Soft
          </button>
          <button
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium cursor-default"
            style={{ background: s("overlaySubtle"), color: s("textSecondary"), border: `1px solid ${s("borderDefault")}` }}
          >
            Ghost
          </button>
        </div>

        {/* Input */}
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{ background: s("overlaySubtle"), border: `1px solid ${s("borderDefault")}` }}
        >
          <Search size={13} style={{ color: s("textMuted") }} />
          <span className="text-[12px]" style={{ color: s("textMuted") }}>Search tickets...</span>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
            style={{ background: `${s("textTertiary")}18`, color: s("textTertiary") }}
          >
            <LayoutGrid size={10} /> To Do
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
            style={{ background: `${s("brand500")}22`, color: s("brand400") }}
          >
            <MessageCircle size={10} /> In Progress
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
            style={{ background: `${s("testing500")}22`, color: s("testing400") }}
          >
            <FlaskConical size={10} /> Testing
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
            style={{ background: `${s("secondary500")}22`, color: s("secondary400") }}
          >
            <Check size={10} /> Done
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
            style={{ background: `${s("warning500")}22`, color: s("warning400") }}
          >
            <AlertTriangle size={10} /> Blocked
          </span>
        </div>
      </div>

      {/* Floating card (tooltip / popover style) */}
      <div
        className="rounded-xl p-3 flex flex-col gap-2"
        style={{
          background: s("surfaceFloating"),
          border: `1px solid ${s("borderStrong")}`,
          boxShadow: mode === "dark"
            ? "0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)"
            : "0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div className="flex items-center gap-2">
          <KanbanSquare size={14} style={{ color: s("brand400") }} />
          <span className="text-[12px] font-medium" style={{ color: s("textPrimary") }}>VALK-1234</span>
          <span className="text-[11px]" style={{ color: s("textTertiary") }}>Story</span>
        </div>
        <span className="text-[12px] leading-relaxed" style={{ color: s("textSecondary") }}>
          Implement dark/light mode switching with persistent user preference
        </span>
        <div className="flex items-center gap-3 pt-1">
          <div className="flex items-center gap-1">
            <GitBranch size={11} style={{ color: s("textMuted") }} />
            <span className="text-[10px]" style={{ color: s("textMuted") }}>feature/theme</span>
          </div>
          <div className="flex items-center gap-1">
            <Bell size={11} style={{ color: s("textMuted") }} />
            <span className="text-[10px]" style={{ color: s("textMuted") }}>2 comments</span>
          </div>
        </div>
      </div>

      {/* Nav item samples */}
      <div className="flex flex-col gap-0.5 rounded-xl p-2" style={{ background: s("surfaceElevated"), border: `1px solid ${s("borderDefault")}` }}>
        <div
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium"
          style={{ background: `${s("brand600")}1f`, color: s("brand300") }}
        >
          <LayoutGrid size={15} style={{ color: s("brand400") }} />
          Dashboard
        </div>
        <div
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium"
          style={{ color: s("textSecondary") }}
        >
          <KanbanSquare size={15} style={{ color: s("textTertiary") }} />
          Sprint Board
        </div>
        <div
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium"
          style={{ color: s("textSecondary") }}
        >
          <MessageCircle size={15} style={{ color: s("textTertiary") }} />
          Chat
        </div>
      </div>

      {/* Color swatch row */}
      <div className="flex items-center gap-1.5">
        {(["brand500", "brand400", "brand300", "secondary500", "secondary400", "warning400", "testing400"] as const).map((key) => (
          <div key={key} className="flex flex-col items-center gap-1">
            <div className="h-5 w-5 rounded-full" style={{ background: s(key) }} />
            <span className="text-[8px] font-mono" style={{ color: s("textMuted") }}>
              {s(key).startsWith("#") ? s(key) : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function ThemePreviewPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="min-h-screen p-6 lg:p-10 max-w-[1600px] mx-auto">
      <div className="mb-10">
        <h1 className="font-[var(--font-display)] text-heading-lg font-bold tracking-[-0.03em] text-text-primary">
          Theme Proposals
        </h1>
        <p className="mt-2 text-body text-text-secondary leading-relaxed max-w-2xl">
          Four color scheme options for Bridge. Each shown in dark and light mode with the key interface elements: surfaces, text hierarchy, buttons, badges, inputs, navigation, and ticket cards.
        </p>
      </div>

      <div className="flex flex-col gap-10">
        {schemes.map((scheme) => {
          const isExpanded = expandedId === scheme.id;
          return (
            <div key={scheme.id} className="flex flex-col gap-4">
              {/* Scheme header */}
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : scheme.id)}
                className="flex items-start gap-3 text-left group cursor-pointer"
              >
                <div
                  className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-transform duration-200"
                  style={{
                    background: scheme.dark.brand500,
                    transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                  }}
                >
                  <ChevronDown size={12} className="text-white -rotate-90" />
                </div>
                <div>
                  <h2 className="text-body-lg font-semibold text-text-primary group-hover:text-[var(--color-brand-400)] transition-colors duration-150">
                    {scheme.name}
                    {scheme.id === "current" && (
                      <span className="ml-2 rounded-full bg-overlay-default px-2 py-0.5 text-[10px] font-normal text-text-tertiary">
                        Active
                      </span>
                    )}
                  </h2>
                  <p className="text-body-sm text-text-secondary mt-0.5">{scheme.description}</p>
                </div>
              </button>

              {/* Expanded preview */}
              {isExpanded && (
                <div className="flex gap-4 overflow-x-auto pb-2 pl-8">
                  <PreviewCard colors={scheme.dark} mode="dark" />
                  <PreviewCard colors={scheme.light} mode="light" />
                </div>
              )}

              {/* Collapsed swatch strip */}
              {!isExpanded && (
                <div className="flex items-center gap-4 pl-8">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-text-muted w-8">Dark</span>
                    <div className="flex gap-0.5">
                      <div className="h-6 w-10 rounded-l-md" style={{ background: scheme.dark.surfaceBase }} />
                      <div className="h-6 w-10" style={{ background: scheme.dark.surfaceElevated }} />
                      <div className="h-6 w-10 rounded-r-md" style={{ background: scheme.dark.surfaceFloating }} />
                    </div>
                    <div className="ml-1 flex gap-0.5">
                      <div className="h-6 w-6 rounded-md" style={{ background: scheme.dark.brand500 }} />
                      <div className="h-6 w-6 rounded-md" style={{ background: scheme.dark.brand400 }} />
                      <div className="h-6 w-6 rounded-md" style={{ background: scheme.dark.secondary400 }} />
                    </div>
                  </div>
                  <div className="w-px h-5 bg-border-default" />
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-text-muted w-8">Light</span>
                    <div className="flex gap-0.5">
                      <div className="h-6 w-10 rounded-l-md border border-border-subtle" style={{ background: scheme.light.surfaceBase }} />
                      <div className="h-6 w-10 border-y border-border-subtle" style={{ background: scheme.light.surfaceElevated }} />
                      <div className="h-6 w-10 rounded-r-md border border-border-subtle" style={{ background: scheme.light.surfaceFloating }} />
                    </div>
                    <div className="ml-1 flex gap-0.5">
                      <div className="h-6 w-6 rounded-md" style={{ background: scheme.light.brand500 }} />
                      <div className="h-6 w-6 rounded-md" style={{ background: scheme.light.brand400 }} />
                      <div className="h-6 w-6 rounded-md" style={{ background: scheme.light.secondary400 }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="mt-12 rounded-xl border border-border-default bg-overlay-subtle p-4 max-w-2xl">
        <p className="text-body-sm text-text-tertiary leading-relaxed">
          Click a scheme to expand and compare dark/light previews side by side. The palette tokens (brand, secondary, warning, testing) cascade through the entire app via CSS variables, so switching is a single-file change in <code className="text-[var(--color-brand-400)] bg-overlay-default px-1.5 py-0.5 rounded text-[11px]">globals.css</code>.
        </p>
      </div>
    </div>
  );
}
