"use client";

import { useState } from "react";

/* ------------------------------------------------------------------ */
/*  Three Arctic Station sub-variations                                */
/* ------------------------------------------------------------------ */

const themes = {
  polar: {
    name: "Polar",
    subtitle: "Deep fjord blue with pale frost accents. Crisp, precise, Nordic.",
    brand: { 50: "#e8f1fb", 100: "#c4dcf5", 200: "#96c2ed", 300: "#5ea4e3", 400: "#3389d8", 500: "#1a6fc2", 600: "#155a9e", 700: "#10447a", 800: "#0c3259", 900: "#08223d", 950: "#051526" },
    accent: { 50: "#ecfdf8", 100: "#cffaeb", 200: "#9ff4d8", 300: "#63e9c0", 400: "#34d4a5", 500: "#18b88a", 600: "#0f946e", 700: "#0b7358", 800: "#095943", 900: "#073d2f", 950: "#04261d" },
    signal: "#ef5555",
    surfaceBase: "#070b12",
    surfaceElevated: "#0c1219",
    surfaceFloating: "#131c28",
    sidebarBg: "#090e16",
    textPrimary: "rgba(230,240,255,0.94)",
    textSecondary: "rgba(160,195,235,0.52)",
    textMuted: "rgba(140,180,225,0.26)",
    activeIndicator: "#3389d8",
    gradientA: "radial-gradient(circle, rgba(26,111,194,0.16) 0%, transparent 70%)",
    gradientB: "radial-gradient(circle, rgba(24,184,138,0.06) 0%, transparent 70%)",
    horizonLine: "linear-gradient(90deg, transparent 0%, rgba(26,111,194,0.35) 35%, rgba(24,184,138,0.12) 65%, transparent 100%)",
    shadowBrand: "0 2px 14px rgba(26,111,194,0.35), inset 0 1px 0 rgba(255,255,255,0.12)",
    shadowAccent: "0 2px 10px rgba(24,184,138,0.18)",
    monogram: "Br",
  },
  aurora: {
    name: "Aurora",
    subtitle: "Northern lights. Cool slate base, aurora cyan-to-violet gradient feel.",
    brand: { 50: "#e6f7fa", 100: "#b8eaf2", 200: "#82dae8", 300: "#46c8de", 400: "#1cb5d4", 500: "#0e9ab8", 600: "#0b7d96", 700: "#086073", 800: "#064853", 900: "#043137", 950: "#021e22" },
    accent: { 50: "#f3edfd", 100: "#ddd0f9", 200: "#c2abf4", 300: "#a482ed", 400: "#8b60e5", 500: "#7244d4", 600: "#5b32b8", 700: "#46258f", 800: "#331b68", 900: "#231247", 950: "#150b2c" },
    signal: "#f06060",
    surfaceBase: "#080a10",
    surfaceElevated: "#0d1118",
    surfaceFloating: "#151b26",
    sidebarBg: "#0a0d14",
    textPrimary: "rgba(225,238,255,0.93)",
    textSecondary: "rgba(150,200,230,0.50)",
    textMuted: "rgba(140,185,220,0.25)",
    activeIndicator: "#1cb5d4",
    gradientA: "radial-gradient(circle, rgba(14,154,184,0.14) 0%, transparent 70%)",
    gradientB: "radial-gradient(circle, rgba(114,68,212,0.08) 0%, transparent 70%)",
    horizonLine: "linear-gradient(90deg, transparent 0%, rgba(14,154,184,0.30) 25%, rgba(114,68,212,0.18) 60%, rgba(139,96,229,0.08) 80%, transparent 100%)",
    shadowBrand: "0 2px 14px rgba(14,154,184,0.35), inset 0 1px 0 rgba(255,255,255,0.10)",
    shadowAccent: "0 2px 10px rgba(114,68,212,0.22)",
    monogram: "Br",
  },
  ice: {
    name: "Ice Shelf",
    subtitle: "Bleached steel with warm amber signal. High contrast, functional, sharp.",
    brand: { 50: "#edf2f8", 100: "#d1dde9", 200: "#adc2d8", 300: "#84a4c4", 400: "#6389b0", 500: "#4a7099", 600: "#3b5a7c", 700: "#2d4460", 800: "#213246", 900: "#16222f", 950: "#0d151e" },
    accent: { 50: "#fef8ee", 100: "#fce9cc", 200: "#f8d49e", 300: "#f3bb6a", 400: "#eda33e", 500: "#d98c28", 600: "#b47020", 700: "#8c5618", 800: "#663f12", 900: "#442b0d", 950: "#291a08" },
    signal: "#e85050",
    surfaceBase: "#080a0e",
    surfaceElevated: "#0e1216",
    surfaceFloating: "#171d24",
    sidebarBg: "#0a0d12",
    textPrimary: "rgba(220,232,248,0.92)",
    textSecondary: "rgba(160,185,215,0.48)",
    textMuted: "rgba(140,170,205,0.24)",
    activeIndicator: "#6389b0",
    gradientA: "radial-gradient(circle, rgba(74,112,153,0.12) 0%, transparent 70%)",
    gradientB: "radial-gradient(circle, rgba(217,140,40,0.06) 0%, transparent 70%)",
    horizonLine: "linear-gradient(90deg, transparent 0%, rgba(74,112,153,0.28) 40%, rgba(217,140,40,0.14) 70%, transparent 100%)",
    shadowBrand: "0 2px 14px rgba(74,112,153,0.30), inset 0 1px 0 rgba(255,255,255,0.10)",
    shadowAccent: "0 2px 10px rgba(217,140,40,0.20)",
    monogram: "Br",
  },
} as const;

type ThemeKey = keyof typeof themes;

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const mockTickets = [
  { key: "BR-101", title: "Implement SSE streaming for agent tasks", status: "IN PROGRESS", assignee: "Thijs", points: 5, po: "In Dev", score: 82 },
  { key: "BR-102", title: "Add version conflict resolution UI", status: "TO DO", assignee: "Agent", points: 8, po: "Ready for Dev", score: 64 },
  { key: "BR-103", title: "Sprint burndown chart widget", status: "DONE", assignee: "Agent", points: 3, po: "Done", score: 91 },
  { key: "BR-104", title: "Jira webhook signature verification", status: "TEST", assignee: "Thijs", points: 5, po: "Testing", score: 77 },
  { key: "BR-105", title: "Story writer split-pane mode", status: "IN PROGRESS", assignee: "Agent", points: 13, po: "In Dev", score: 58 },
];

const mockNav = [
  { label: "Dashboard", icon: "grid" },
  { label: "Chat", icon: "chat" },
  { label: "Sprint Board", icon: "board", active: true },
  { label: "Test Center", icon: "flask" },
  { label: "Refinement", icon: "sliders" },
  { label: "Jobs", icon: "clock" },
  { label: "Settings", icon: "gear" },
];

const mockMessages = [
  { role: "user" as const, text: "Review the acceptance criteria for BR-102" },
  { role: "assistant" as const, text: "I've reviewed BR-102. The AC covers the main conflict scenarios but is missing edge cases for concurrent edits on the same field. I'd suggest adding criteria for: field-level merge, last-write-wins fallback, and user notification on auto-resolve." },
  { role: "user" as const, text: "Add those as sub-tasks" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function statusColor(status: string, theme: typeof themes[ThemeKey]) {
  switch (status) {
    case "DONE": return { bg: "rgba(34,197,94,0.12)", text: "#4ade80" };
    case "IN PROGRESS": return { bg: `${theme.brand[500]}22`, text: theme.brand[400] };
    case "TEST": return { bg: "rgba(168,130,255,0.12)", text: "#a882ff" };
    default: return { bg: "rgba(255,255,255,0.05)", text: theme.textSecondary };
  }
}

function scoreColor(score: number, theme: typeof themes[ThemeKey]) {
  if (score >= 80) return "#4ade80";
  if (score >= 65) return theme.accent[400];
  return theme.signal;
}

/* Simple SVG icons to make the sidebar feel real */
function NavIcon({ type, active, theme }: { type: string; active?: boolean; theme: typeof themes[ThemeKey] }) {
  const color = active ? theme.brand[400] : "rgba(255,255,255,0.25)";
  const svgs: Record<string, string> = {
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
    chat: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
    board: "M4 4h5v16H4zM10 4h5v12h-5zM16 4h5v8h-5z",
    flask: "M9 3h6v2H9zM10 5v6l-5 8.5A1.5 1.5 0 006.3 22h11.4a1.5 1.5 0 001.3-2.5L14 11V5",
    sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
    clock: "M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2",
    gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z",
  };
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={svgs[type] || svgs.grid} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Mini components                                                    */
/* ------------------------------------------------------------------ */

function SidebarPreview({ theme }: { theme: typeof themes[ThemeKey] }) {
  return (
    <div
      className="flex flex-col overflow-hidden h-full shrink-0"
      style={{ background: theme.sidebarBg, width: 200 }}
    >
      {/* Sidebar header */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div
          className="flex items-center justify-center h-8 w-8 rounded-lg font-black text-[12px] tracking-tighter text-white"
          style={{ background: theme.brand[600], boxShadow: theme.shadowBrand }}
        >
          {theme.monogram}
        </div>
        <div className="flex flex-col">
          <span
            className="text-[14px] font-semibold tracking-tight leading-tight"
            style={{ color: theme.textPrimary, fontFamily: "var(--font-display)" }}
          >
            Bridge
          </span>
          <span className="text-[9px]" style={{ color: theme.textMuted }}>
            Command Center
          </span>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2.5 pt-3 flex flex-col gap-0.5">
        {mockNav.map((item) => {
          const active = "active" in item && item.active;
          return (
            <div
              key={item.label}
              className="relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium transition-colors cursor-pointer"
              style={{
                color: active ? theme.brand[300] : theme.textSecondary,
                background: active ? `${theme.brand[600]}15` : "transparent",
              }}
            >
              {active && (
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full"
                  style={{ background: theme.activeIndicator }}
                />
              )}
              <NavIcon type={item.icon} active={active || false} theme={theme} />
              {item.label}
            </div>
          );
        })}
      </nav>

      {/* Sync indicator */}
      <div className="px-3.5 pb-3 flex items-center gap-2 text-[10px]" style={{ color: theme.textMuted }}>
        <div className="relative">
          <div className="w-2 h-2 rounded-full" style={{ background: theme.accent[500] }} />
          <div className="absolute inset-0 w-2 h-2 rounded-full animate-ping opacity-30" style={{ background: theme.accent[400] }} />
        </div>
        Synced 2m ago
      </div>
    </div>
  );
}

function SprintBoardPreview({ theme }: { theme: typeof themes[ThemeKey] }) {
  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Horizon line */}
      <div className="h-px w-full" style={{ background: theme.horizonLine }} />

      {/* Header area */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-baseline justify-between">
          <div>
            <h2
              className="text-lg font-bold tracking-[-0.03em]"
              style={{ color: theme.textPrimary, fontFamily: "var(--font-display)" }}
            >
              Sprint Board
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: theme.textSecondary }}>
              Sprint 24 &middot; 5 tickets &middot; 34 points
            </p>
          </div>
          {/* Search + actions */}
          <div className="flex gap-2">
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px]"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: theme.textMuted,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              Search...
              <span className="ml-2 px-1 py-0.5 rounded text-[8px] border" style={{ borderColor: "rgba(255,255,255,0.1)" }}>Cmd+K</span>
            </div>
            <button
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-medium cursor-pointer"
              style={{ background: theme.brand[600], color: "#fff", boxShadow: theme.shadowBrand }}
            >
              Sync
            </button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex gap-1.5 mt-3">
          {["All", "To Do", "In Progress", "Test", "Done"].map((f, i) => (
            <div
              key={f}
              className="px-2.5 py-1 rounded-md text-[10px] font-medium cursor-pointer transition-colors"
              style={{
                background: i === 0 ? `${theme.brand[500]}20` : "rgba(255,255,255,0.03)",
                color: i === 0 ? theme.brand[300] : theme.textSecondary,
                border: `1px solid ${i === 0 ? `${theme.brand[500]}30` : "rgba(255,255,255,0.05)"}`,
              }}
            >
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* Ticket table */}
      <div className="px-5 flex-1">
        <div
          className="rounded-lg overflow-hidden border"
          style={{ borderColor: "rgba(255,255,255,0.06)", background: theme.surfaceElevated }}
        >
          {/* Table header */}
          <div
            className="grid gap-2 px-3 py-2 text-[10px] font-medium uppercase tracking-wide"
            style={{
              color: theme.textMuted,
              gridTemplateColumns: "65px 1fr 88px 52px 40px 36px 78px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span>Key</span>
            <span>Title</span>
            <span>Status</span>
            <span>Assign</span>
            <span>Pts</span>
            <span>Score</span>
            <span>PO Status</span>
          </div>

          {/* Rows */}
          {mockTickets.map((t, i) => {
            const sc = statusColor(t.status, theme);
            return (
              <div
                key={t.key}
                className="grid gap-2 px-3 py-2 text-[11px] items-center transition-colors cursor-pointer"
                style={{
                  gridTemplateColumns: "65px 1fr 88px 52px 40px 36px 78px",
                  borderBottom: i < mockTickets.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  color: theme.textPrimary,
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ color: theme.brand[400], fontWeight: 600, fontSize: "10px" }}>{t.key}</span>
                <span className="truncate">{t.title}</span>
                <span
                  className="px-1.5 py-0.5 rounded text-[9px] font-semibold text-center"
                  style={{ background: sc.bg, color: sc.text }}
                >
                  {t.status}
                </span>
                <span className="text-[10px]" style={{ color: theme.textSecondary }}>{t.assignee}</span>
                <span className="text-center font-semibold tabular-nums text-[10px]" style={{ color: theme.accent[400] }}>{t.points}</span>
                <span className="text-center font-semibold tabular-nums text-[10px]" style={{ color: scoreColor(t.score, theme) }}>{t.score}</span>
                <span className="text-[10px]" style={{ color: theme.textSecondary }}>{t.po}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom stats bar */}
      <div
        className="mx-5 mb-3 mt-2 flex items-center gap-5 px-3 py-2 rounded-lg"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
      >
        {[
          { label: "Velocity", value: "42 pts", color: theme.brand[400] },
          { label: "Completion", value: "62%", color: theme.accent[400] },
          { label: "Avg Score", value: "74", color: theme.accent[300] },
          { label: "Blocked", value: "0", color: theme.signal },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wide" style={{ color: theme.textMuted }}>{s.label}</span>
            <span className="text-[11px] font-semibold tabular-nums" style={{ color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatPreview({ theme }: { theme: typeof themes[ThemeKey] }) {
  return (
    <div
      className="rounded-xl overflow-hidden border flex flex-col"
      style={{ background: theme.surfaceElevated, borderColor: "rgba(255,255,255,0.06)", height: 280 }}
    >
      <div className="h-px w-full" style={{ background: theme.horizonLine }} />

      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        <span className="text-xs font-semibold" style={{ color: theme.textPrimary, fontFamily: "var(--font-display)" }}>
          Chat
        </span>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: theme.brand[400] }} />
            <div className="absolute inset-0 w-1.5 h-1.5 rounded-full animate-ping opacity-40" style={{ background: theme.brand[400] }} />
          </div>
          <span className="text-[10px]" style={{ color: theme.brand[400] }}>Agent online</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 px-4 py-2 space-y-2 overflow-hidden">
        {mockMessages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="rounded-lg px-3 py-2 text-[11px] leading-relaxed max-w-[85%]"
              style={{
                background: m.role === "user" ? `${theme.brand[600]}20` : "rgba(255,255,255,0.03)",
                color: m.role === "user" ? theme.brand[200] : theme.textPrimary,
                border: `1px solid ${m.role === "user" ? `${theme.brand[500]}18` : "rgba(255,255,255,0.04)"}`,
              }}
            >
              {m.text}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        <div className="flex justify-start">
          <div
            className="rounded-lg px-3 py-2 flex gap-1 items-center"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)" }}
          >
            {[0, 1, 2].map((d) => (
              <div
                key={d}
                className="w-1.5 h-1.5 rounded-full animate-bounce"
                style={{
                  background: theme.brand[400],
                  opacity: 0.5,
                  animationDelay: `${d * 0.15}s`,
                  animationDuration: "0.8s",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="px-4 pb-3 pt-1">
        <div
          className="rounded-lg px-3 py-2 text-[11px] flex items-center justify-between"
          style={{
            background: theme.surfaceBase,
            border: `1px solid rgba(255,255,255,0.08)`,
            color: theme.textMuted,
          }}
        >
          <span>Send a message...</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.brand[500]} strokeWidth="2" strokeLinecap="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>
        </div>
      </div>
    </div>
  );
}

function ComponentsPreview({ theme }: { theme: typeof themes[ThemeKey] }) {
  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-4"
      style={{ background: theme.surfaceElevated, borderColor: "rgba(255,255,255,0.06)", height: 280 }}
    >
      {/* Buttons */}
      <div>
        <span className="text-[9px] uppercase tracking-widest block mb-2" style={{ color: theme.textMuted }}>Buttons</span>
        <div className="flex flex-wrap gap-2">
          <button
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white transition-transform active:scale-95 cursor-pointer"
            style={{ background: theme.brand[600], boxShadow: theme.shadowBrand }}
          >
            Primary
          </button>
          <button
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-transform active:scale-95 cursor-pointer"
            style={{
              background: `${theme.accent[500]}15`,
              color: theme.accent[300],
              border: `1px solid ${theme.accent[500]}28`,
            }}
          >
            Accent
          </button>
          <button
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-transform active:scale-95 cursor-pointer"
            style={{
              background: "rgba(255,255,255,0.03)",
              color: theme.textSecondary,
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            Ghost
          </button>
          <button
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-transform active:scale-95 cursor-pointer"
            style={{
              background: `${theme.signal}12`,
              color: theme.signal,
              border: `1px solid ${theme.signal}22`,
            }}
          >
            Danger
          </button>
        </div>
      </div>

      {/* Status badges */}
      <div>
        <span className="text-[9px] uppercase tracking-widest block mb-2" style={{ color: theme.textMuted }}>Status Badges</span>
        <div className="flex gap-2">
          {[
            { label: "Running", bg: `${theme.brand[500]}18`, color: theme.brand[400], dot: true },
            { label: "Success", bg: "rgba(34,197,94,0.12)", color: "#4ade80", dot: false },
            { label: "Failed", bg: `${theme.signal}14`, color: theme.signal, dot: false },
            { label: "Queued", bg: `${theme.accent[500]}12`, color: theme.accent[300], dot: false },
          ].map((b) => (
            <span
              key={b.label}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium"
              style={{ background: b.bg, color: b.color }}
            >
              {b.dot && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50" style={{ background: b.color }} />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: b.color }} />
                </span>
              )}
              {b.label}
            </span>
          ))}
        </div>
      </div>

      {/* Notification toast */}
      <div>
        <span className="text-[9px] uppercase tracking-widest block mb-2" style={{ color: theme.textMuted }}>Notifications</span>
        <div
          className="flex items-center gap-2.5 rounded-lg px-3 py-2.5"
          style={{
            background: `${theme.accent[500]}08`,
            border: `1px solid ${theme.accent[500]}15`,
          }}
        >
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: theme.accent[400] }} />
          <span className="text-[11px] flex-1" style={{ color: theme.accent[300] }}>
            Incremental sync: 3 tickets updated, 1 new comment
          </span>
          <span className="text-[9px]" style={{ color: theme.textMuted }}>12s ago</span>
        </div>
        <div
          className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 mt-1.5"
          style={{
            background: `${theme.signal}08`,
            border: `1px solid ${theme.signal}12`,
          }}
        >
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: theme.signal }} />
          <span className="text-[11px] flex-1" style={{ color: theme.signal }}>
            Jira sync failed: connection timeout
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer" style={{ color: theme.textSecondary, border: "1px solid rgba(255,255,255,0.08)" }}>Retry</span>
        </div>
      </div>

      {/* Score bar */}
      <div>
        <span className="text-[9px] uppercase tracking-widest block mb-2" style={{ color: theme.textMuted }}>Quality Score</span>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="h-full rounded-full" style={{ width: "74%", background: `linear-gradient(90deg, ${theme.brand[500]}, ${theme.accent[400]})` }} />
          </div>
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: theme.accent[400] }}>74</span>
        </div>
      </div>
    </div>
  );
}

function ColorSwatches({ theme }: { theme: typeof themes[ThemeKey] }) {
  const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
  return (
    <div className="space-y-3">
      <div>
        <span className="text-[9px] uppercase tracking-widest block mb-1.5" style={{ color: theme.textMuted }}>Brand</span>
        <div className="flex gap-1">
          {steps.map((s) => (
            <div key={s} className="flex flex-col items-center gap-0.5">
              <div className="w-7 h-7 rounded-md" style={{ background: theme.brand[s] }} />
              <span className="text-[8px] tabular-nums" style={{ color: theme.textMuted }}>{s}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <span className="text-[9px] uppercase tracking-widest block mb-1.5" style={{ color: theme.textMuted }}>Accent</span>
        <div className="flex gap-1">
          {steps.map((s) => (
            <div key={s} className="flex flex-col items-center gap-0.5">
              <div className="w-7 h-7 rounded-md" style={{ background: theme.accent[s] }} />
              <span className="text-[8px] tabular-nums" style={{ color: theme.textMuted }}>{s}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-4 pt-1">
        {[
          { label: "Base", color: theme.surfaceBase },
          { label: "Elevated", color: theme.surfaceElevated },
          { label: "Floating", color: theme.surfaceFloating },
          { label: "Signal", color: theme.signal },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md border" style={{ background: s.color, borderColor: "rgba(255,255,255,0.1)" }} />
            <span className="text-[10px]" style={{ color: theme.textMuted }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main explorer                                                      */
/* ------------------------------------------------------------------ */

export function ThemeExplorer() {
  const [active, setActive] = useState<ThemeKey>("polar");
  const theme = themes[active];

  return (
    <div
      className="noise-overlay relative min-h-full transition-colors duration-500"
      style={{ background: theme.surfaceBase }}
    >
      {/* Background atmosphere */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-15%] left-[20%] h-[500px] w-[500px] rounded-full opacity-40 transition-all duration-700" style={{ background: theme.gradientA }} />
        <div className="absolute bottom-[-10%] right-[15%] h-[350px] w-[350px] rounded-full opacity-50 transition-all duration-700" style={{ background: theme.gradientB }} />
      </div>

      <div className="relative z-10 px-8 py-8 lg:px-12 lg:py-10 max-w-[1440px] mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: theme.brand[400] }}>
            Arctic Station Direction
          </p>
          <h1
            className="text-3xl font-bold tracking-[-0.03em] transition-colors duration-300"
            style={{ color: theme.textPrimary, fontFamily: "var(--font-display)" }}
          >
            Bridge Theme Explorer
          </h1>
          <p
            className="mt-1.5 text-sm leading-[1.7] max-w-2xl transition-colors duration-300"
            style={{ color: theme.textSecondary }}
          >
            Three variations within the Arctic Station direction. All share cool, blue-tinted surfaces
            and precise aesthetics. They differ in brand hue intensity and accent color strategy.
          </p>
        </div>

        {/* Theme selector tabs */}
        <div className="flex gap-2 mb-2">
          {(Object.keys(themes) as ThemeKey[]).map((key) => {
            const t = themes[key];
            const isActive = key === active;
            return (
              <button
                key={key}
                onClick={() => setActive(key)}
                className="relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 active:scale-[0.97]"
                style={{
                  background: isActive ? theme.surfaceFloating : "rgba(255,255,255,0.03)",
                  color: isActive ? theme.textPrimary : theme.textSecondary,
                  border: `1px solid ${isActive ? `${t.brand[500]}40` : "rgba(255,255,255,0.06)"}`,
                  boxShadow: isActive ? `0 0 24px ${t.brand[500]}12` : "none",
                }}
              >
                <div className="w-3 h-3 rounded-full" style={{ background: t.brand[500] }} />
                <span style={{ fontFamily: "var(--font-display)" }}>{t.name}</span>
                {(t.accent[500] as string) !== (t.brand[500] as string) && (
                  <div className="w-2.5 h-2.5 rounded-full -ml-1" style={{ background: t.accent[500] }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Subtitle */}
        <p
          className="text-xs mb-6 italic transition-colors duration-300"
          style={{ color: theme.textMuted }}
        >
          {theme.subtitle}
        </p>

        {/* PREVIEW: Full app mock */}
        <div className="mb-6">
          <span className="text-[9px] uppercase tracking-widest block mb-2" style={{ color: theme.textMuted }}>
            Full Layout Preview
          </span>
          <div
            className="flex rounded-2xl overflow-hidden border"
            style={{ background: theme.surfaceBase, borderColor: "rgba(255,255,255,0.06)", height: 520 }}
          >
            <SidebarPreview theme={theme} />
            <div className="flex-1 border-l" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <SprintBoardPreview theme={theme} />
            </div>
          </div>
        </div>

        {/* PREVIEW: Chat + Components */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div>
            <span className="text-[9px] uppercase tracking-widest block mb-2" style={{ color: theme.textMuted }}>
              Chat Interface
            </span>
            <ChatPreview theme={theme} />
          </div>
          <div>
            <span className="text-[9px] uppercase tracking-widest block mb-2" style={{ color: theme.textMuted }}>
              Components
            </span>
            <ComponentsPreview theme={theme} />
          </div>
        </div>

        {/* Palette */}
        <div
          className="rounded-xl border p-5 mb-6"
          style={{ background: theme.surfaceElevated, borderColor: "rgba(255,255,255,0.06)" }}
        >
          <span className="text-[9px] uppercase tracking-widest block mb-3" style={{ color: theme.textMuted }}>
            Full Palette
          </span>
          <ColorSwatches theme={theme} />
        </div>

        {/* Horizon line demo */}
        <div className="mb-6">
          <span className="text-[9px] uppercase tracking-widest block mb-2" style={{ color: theme.textMuted }}>
            Horizon Line
          </span>
          <div className="rounded-xl overflow-hidden border" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <div className="h-[2px] w-full" style={{ background: theme.horizonLine }} />
            <div className="h-12" style={{ background: theme.surfaceBase }} />
          </div>
        </div>
      </div>
    </div>
  );
}
