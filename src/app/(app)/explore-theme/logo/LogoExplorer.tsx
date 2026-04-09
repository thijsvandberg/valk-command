"use client";

import { useState } from "react";

/* ------------------------------------------------------------------ */
/*  All logo marks across 3 rounds + font variations                   */
/* ------------------------------------------------------------------ */

const brand500 = "#1a6fc2";
const brand600 = "#155a9e";
const brand400 = "#3389d8";
const surfaceBase = "#070b12";
const surfaceElevated = "#0c1219";
const textMuted = "rgba(140,180,225,0.26)";

/* === ROUND 1: Bridge / architectural marks ======================== */

function Arch1() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 17V11C4 6.58 7.58 3 12 3C16.42 3 20 6.58 20 11V17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="4" y1="17" x2="4" y2="21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="20" y1="17" x2="20" y2="21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function Arch2() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="5" width="3" height="14" rx="1.5" fill="currentColor" />
      <rect x="17" y="5" width="3" height="14" rx="1.5" fill="currentColor" />
      <rect x="7" y="10" width="10" height="3" rx="1" fill="currentColor" opacity="0.7" />
    </svg>
  );
}
function Arch3() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <line x1="2" y1="16" x2="22" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="4" x2="12" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="6" x2="4" y2="16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
      <line x1="12" y1="6" x2="20" y2="16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
      <line x1="12" y1="9" x2="7" y2="16" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      <line x1="12" y1="9" x2="17" y2="16" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}
function Arch4() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M5 20V8C5 5.24 8.13 3 12 3C15.87 3 19 5.24 19 8V20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="3" y1="20" x2="21" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function Arch5() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M2 18C2 18 5.5 10 9 10C12.5 10 12.5 10 12.5 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M11.5 10C11.5 10 11.5 10 15 10C18.5 10 22 18 22 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="2" y1="18" x2="22" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="5" y1="14" x2="5" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="12" y1="10" x2="12" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="19" y1="14" x2="19" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}
function Arch6() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M6 4H14C16.76 4 19 6.24 19 9C19 10.5 18.3 11.8 17.2 12.6C18.8 13.4 20 15.1 20 17C20 19.76 17.76 22 15 22H6V4Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <line x1="6" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function Arch7() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 16L10.5 10.5L16 8L13.5 13.5L8 16Z" fill="currentColor" opacity="0.8" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}
function Arch8() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 16C3 16 7 7 12 7C17 7 21 16 21 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="1" y1="16" x2="23" y2="16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7" r="1.5" fill="currentColor" opacity="0.6" />
    </svg>
  );
}
function Arch9() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="5" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="19" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M8 12C10 8 14 8 16 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}
function Arch10() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="6" width="3" height="14" rx="0.5" fill="currentColor" opacity="0.85" />
      <rect x="16" y="6" width="3" height="14" rx="0.5" fill="currentColor" opacity="0.85" />
      <path d="M6.5 8C6.5 8 9 5 12 5C15 5 17.5 8 17.5 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="2" y1="14" x2="22" y2="14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="5" y1="6" x2="3" y2="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />
      <line x1="19" y1="6" x2="21" y2="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

/* === ROUND 2: Hub / node / connection marks ======================= */

function Hub1() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <line x1="12" y1="2" x2="12" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="16" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function Hub2() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 3L20.66 8V16L12 21L3.34 16V8L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" opacity="0.7" />
    </svg>
  );
}
function Hub3() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="19" cy="5" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="21" r="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="10" y1="10" x2="6.5" y2="6.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="14" y1="10" x2="17.5" y2="6.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="12" y1="15" x2="12" y2="19" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function Hub4() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="12" y="2.5" width="13.5" height="13.5" rx="2" transform="rotate(45 12 2.5)" stroke="currentColor" strokeWidth="1.8" />
      <line x1="12" y1="7" x2="12" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="7" y1="12" x2="17" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function Hub5() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.3" opacity="0.7" />
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}
function Hub6() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <line x1="12" y1="3" x2="12" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="15" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="4.2" y1="7.5" x2="9.4" y2="10.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="14.6" y1="13.5" x2="19.8" y2="16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="4.2" y1="16.5" x2="9.4" y2="13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="14.6" y1="10.5" x2="19.8" y2="7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function Hub7() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="5" width="14" height="14" rx="3.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="5" r="1.5" fill="currentColor" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" />
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

/* === ROUND 3: Converge / merge marks ============================== */

function Conv1() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="5" fill="currentColor" />
      <path d="M12 4V10" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M9 7L12 10L15 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19L10.5 13" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M19 19L13.5 13" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="12" cy="13" r="2" fill="white" />
    </svg>
  );
}
function Conv2() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="currentColor" />
      <path d="M12 4L9.5 7L12 7L14.5 7L12 4Z" fill="white" />
      <path d="M12 20L14.5 17L12 17L9.5 17L12 20Z" fill="white" />
      <path d="M4 12L7 14.5L7 12L7 9.5L4 12Z" fill="white" />
      <path d="M20 12L17 9.5L17 12L17 14.5L20 12Z" fill="white" />
      <circle cx="12" cy="12" r="2.5" fill="white" />
    </svg>
  );
}
function Conv3() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="5" fill="currentColor" />
      <path d="M12 5C12 5 12 9 12 11" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M12 11C9.5 11 6.5 9.5 5 7" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M12 11C13 13.5 12 16.5 10 19" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M12 11C14.5 10.5 17.5 12 19 14.5" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="12" cy="11" r="1.8" fill="white" />
    </svg>
  );
}
function Conv4() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="5" fill="currentColor" />
      <path d="M4 6C4 6 7 14 12 14C17 14 20 6 20 6" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
      <line x1="12" y1="14" x2="12" y2="20" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M9 17L12 20L15 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Conv5() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 1L22.39 6.5V17.5L12 23L1.61 17.5V6.5L12 1Z" fill="currentColor" />
      <line x1="12" y1="3" x2="12" y2="10" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
      <line x1="4.5" y1="17" x2="10.5" y2="13" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
      <line x1="19.5" y1="17" x2="13.5" y2="13" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.2" fill="white" />
    </svg>
  );
}
function Conv6() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="5" fill="currentColor" />
      <path d="M4 5C4 5 10 10 12 12C14 10 20 5 20 5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M4 19C4 19 10 14 12 12C14 14 20 19 20 19" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2" fill="white" />
    </svg>
  );
}
function Conv7() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="5" fill="currentColor" />
      <path d="M12 3V9.5M9 6.5L12 9.5L15 6.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20L9 14.5M5 16L9 14.5L6.5 12" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 20L15 14.5M19 16L15 14.5L17.5 12" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="2" fill="white" />
    </svg>
  );
}
function Conv8() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="5" fill="currentColor" />
      <path d="M5 4C5 4 5 10 12 12" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M12 4C12 4 12 8 12 12" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M19 4C19 4 19 10 12 12" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
      <line x1="12" y1="12" x2="12" y2="20" stroke="white" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
function Conv9() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="currentColor" />
      <path d="M18 6C18 6 18 10 14.5 11.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M16.5 7.5L18 6L19.5 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 6C6 6 10 8 11 11.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M7.5 7.5L6 6L7.5 4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 20C12 20 12 16 12.5 13.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M10.5 18.5L12 20L13.5 18.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="1.5" fill="white" />
    </svg>
  );
}
function Conv10() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="5" fill="currentColor" />
      <path d="M7 5C4 8 4 16 7 19" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M17 5C20 8 20 16 17 19" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.5" fill="white" />
      <line x1="9.5" y1="12" x2="7" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <line x1="14.5" y1="12" x2="17" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* === Section definitions ========================================== */

type MarkDef = { id: string; Icon: () => React.JSX.Element; name: string; desc: string };
type FontDef = { family: string; weight: number; tracking: string; size: string; label: string; transform?: "uppercase"; style?: "italic" };

const fonts: FontDef[] = [
  { family: "var(--font-display)", weight: 700, tracking: "-0.03em", size: "20px", label: "Bricolage Bold" },
  { family: "var(--font-display)", weight: 600, tracking: "-0.02em", size: "19px", label: "Bricolage Semi" },
  { family: "var(--font-body)", weight: 600, tracking: "-0.01em", size: "18px", label: "Inter Semi" },
  { family: "var(--font-body)", weight: 500, tracking: "0.04em", size: "14px", label: "Inter Medium Spaced", transform: "uppercase" },
  { family: "Georgia, serif", weight: 400, tracking: "0em", size: "20px", label: "Georgia Regular", style: "italic" },
  { family: "var(--font-display)", weight: 800, tracking: "-0.04em", size: "21px", label: "Bricolage Extra Bold" },
  { family: "'Courier New', monospace", weight: 700, tracking: "0.02em", size: "17px", label: "Mono Bold" },
  { family: "var(--font-body)", weight: 300, tracking: "0.06em", size: "15px", label: "Inter Light Spaced", transform: "uppercase" },
  { family: "Georgia, serif", weight: 700, tracking: "-0.01em", size: "20px", label: "Georgia Bold" },
  { family: "var(--font-display)", weight: 500, tracking: "0.01em", size: "17px", label: "Bricolage Medium" },
];

const sections: { title: string; subtitle: string; marks: MarkDef[]; useFilledBg: boolean; varyFonts: boolean }[] = [
  {
    title: "Round 1: Bridge / Architectural",
    subtitle: "Arches, pillars, spans, cables. Each paired with a different font treatment.",
    useFilledBg: false,
    varyFonts: true,
    marks: [
      { id: "A1", Icon: Arch1, name: "Minimal Arch", desc: "Clean single arc, two pillars. Architectural, restrained." },
      { id: "A2", Icon: Arch2, name: "H-Span", desc: "Abstract H-shape. Two pillars, one span. Bold, geometric." },
      { id: "A3", Icon: Arch3, name: "Cable-Stayed", desc: "Central tower with radiating cables. Modern, technical." },
      { id: "A4", Icon: Arch4, name: "Gateway", desc: "Smooth arch doorway. Welcoming, monumental." },
      { id: "A5", Icon: Arch5, name: "Double Span", desc: "Two arches, three pillars. Classic multi-span bridge." },
      { id: "A6", Icon: Arch6, name: "Bridge-B", desc: "Letter B shaped as bridge form. Typographic, clever." },
      { id: "A7", Icon: Arch7, name: "Compass", desc: "Navigation compass. Direction, command, wayfinding." },
      { id: "A8", Icon: Arch8, name: "Horizon Arc", desc: "Sunrise arc over horizon line. Expansive, forward-looking." },
      { id: "A9", Icon: Arch9, name: "Connection", desc: "Two nodes linked by span + arc. Connecting systems." },
      { id: "A10", Icon: Arch10, name: "Tower Bridge", desc: "Twin towers with suspension. Structural, iconic." },
    ],
  },
  {
    title: "Round 2: Hub / Node",
    subtitle: "Central nodes, radiating connections, command center. Bricolage Bold wordmark.",
    useFilledBg: false,
    varyFonts: false,
    marks: [
      { id: "H1", Icon: Hub1, name: "Crosshair Hub", desc: "Center node with 4 directional lines. Command, precision." },
      { id: "H2", Icon: Hub2, name: "Hex Node", desc: "Hexagonal shell with center core. Technical, modular." },
      { id: "H3", Icon: Hub3, name: "Network", desc: "Central node connecting 3 satellites. Orchestration." },
      { id: "H4", Icon: Hub4, name: "Diamond Cross", desc: "Rotated square with crosshair. Decision point." },
      { id: "H5", Icon: Hub5, name: "Radar Pulse", desc: "Concentric rings. Signal, monitoring." },
      { id: "H6", Icon: Hub6, name: "Asterisk", desc: "Six rays from center. Radiating control." },
      { id: "H7", Icon: Hub7, name: "Port Square", desc: "Rounded square with edge nodes. Interface." },
    ],
  },
  {
    title: "Round 3: Converge / Merge",
    subtitle: "Bold filled shapes with white cutout arrows converging to center. Bricolage Bold wordmark.",
    useFilledBg: true,
    varyFonts: false,
    marks: [
      { id: "C1", Icon: Conv1, name: "Y-Merge", desc: "Three arrows converging to center node. Git merge." },
      { id: "C2", Icon: Conv2, name: "Quad Inward", desc: "Four chevrons to center in circle. Focus, command." },
      { id: "C3", Icon: Conv3, name: "Triskelion", desc: "Three curved arms spiraling inward. Dynamic." },
      { id: "C4", Icon: Conv4, name: "Funnel Arc", desc: "Bridge arc funneling to output. Aggregation." },
      { id: "C5", Icon: Conv5, name: "Hex Converge", desc: "Three lines to center in hexagon. Precise." },
      { id: "C6", Icon: Conv6, name: "Pinch", desc: "Two X-curves meeting at center. Focus point." },
      { id: "C7", Icon: Conv7, name: "Triple Arrow", desc: "Three arrows converging from corners." },
      { id: "C8", Icon: Conv8, name: "Stream Merge", desc: "Three streams into one pipe. Pipeline." },
      { id: "C9", Icon: Conv9, name: "Vortex", desc: "Three curved arrows spiraling inward." },
      { id: "C10", Icon: Conv10, name: "Brackets", desc: "Embracing curves with center dot." },
    ],
  },
];

const defaultFont: FontDef = { family: "var(--font-display)", weight: 700, tracking: "-0.03em", size: "20px", label: "Bricolage Bold" };

/* === Row component ================================================ */

function MarkRow({ m, font: f, useFilledBg }: { m: MarkDef; font: FontDef; useFilledBg: boolean }) {
  return (
    <div
      className="flex items-center gap-4 rounded-xl px-4 py-3 border"
      style={{ background: surfaceElevated, borderColor: "rgba(255,255,255,0.06)" }}
    >
      <span className="text-[11px] font-bold tabular-nums shrink-0 w-6 text-right" style={{ color: textMuted }}>
        {m.id}
      </span>

      {/* Icon in branded square */}
      {useFilledBg ? (
        <div className="flex items-center justify-center h-10 w-10 rounded-xl shrink-0" style={{ color: brand500 }}>
          <m.Icon />
        </div>
      ) : (
        <div
          className="flex items-center justify-center h-10 w-10 rounded-xl shrink-0 text-white"
          style={{ background: brand600, boxShadow: "0 2px 14px rgba(26,111,194,0.35), inset 0 1px 0 rgba(255,255,255,0.12)" }}
        >
          <m.Icon />
        </div>
      )}

      <div className="h-8 w-px shrink-0" style={{ background: "rgba(255,255,255,0.06)" }} />

      {/* Full lockup */}
      <div className="flex items-center gap-2.5 min-w-[170px]" style={{ color: "rgba(230,240,255,0.94)" }}>
        <div style={{ color: useFilledBg ? brand500 : "rgba(230,240,255,0.94)" }}><m.Icon /></div>
        <span style={{ fontFamily: f.family, fontWeight: f.weight, letterSpacing: f.tracking, fontSize: f.size, textTransform: f.transform, fontStyle: f.style }}>
          Bridge
        </span>
      </div>

      <div className="h-8 w-px shrink-0" style={{ background: "rgba(255,255,255,0.06)" }} />

      {/* Description */}
      <div className="flex-1 min-w-0">
        <span className="text-[11px] font-semibold" style={{ color: "rgba(230,240,255,0.80)" }}>{m.name}</span>
        <span className="text-[10px] block mt-0.5" style={{ color: "rgba(160,195,235,0.38)" }}>{m.desc}</span>
        {f.label !== defaultFont.label && (
          <span className="text-[9px] uppercase tracking-widest mt-0.5 block" style={{ color: textMuted }}>{f.label}</span>
        )}
      </div>

      {/* Sidebar preview */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg shrink-0" style={{ background: "#090e16" }}>
        <div className="flex items-center justify-center h-7 w-7 rounded-md" style={{ color: useFilledBg ? brand500 : "white", background: useFilledBg ? "transparent" : brand600 }}>
          <m.Icon />
        </div>
        <span className="text-[13px]" style={{ fontFamily: f.family, fontWeight: f.weight, letterSpacing: f.tracking, color: "rgba(230,240,255,0.88)", textTransform: f.transform, fontStyle: f.style }}>
          Bridge
        </span>
      </div>
    </div>
  );
}

/* === Main explorer ================================================ */

export function LogoExplorer() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (title: string) => setCollapsed((p) => ({ ...p, [title]: !p[title] }));

  return (
    <div className="noise-overlay relative min-h-full" style={{ background: surfaceBase }}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-15%] left-[20%] h-[500px] w-[500px] rounded-full opacity-40" style={{ background: "radial-gradient(circle, rgba(26,111,194,0.12) 0%, transparent 70%)" }} />
      </div>

      <div className="relative z-10 px-8 py-8 lg:px-12 lg:py-10 max-w-[1200px] mx-auto">
        <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: brand400 }}>Bridge Identity</p>
        <h1 className="text-3xl font-bold tracking-[-0.03em]" style={{ color: "rgba(230,240,255,0.94)", fontFamily: "var(--font-display)" }}>
          Logo Explorer
        </h1>
        <p className="mt-1.5 text-sm leading-[1.7] max-w-2xl mb-10" style={{ color: "rgba(160,195,235,0.52)" }}>
          All 27 marks across 3 rounds. Round 1 varies fonts per row. Rounds 2 and 3 use Bricolage Bold.
        </p>

        {sections.map((section) => {
          const isCollapsed = collapsed[section.title];
          return (
            <div key={section.title} className="mb-8">
              <button
                onClick={() => toggle(section.title)}
                className="flex items-center gap-3 mb-1 cursor-pointer group"
              >
                <span className="text-[10px] transition-transform" style={{ color: textMuted, transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>
                  &#9660;
                </span>
                <h2 className="text-lg font-bold tracking-[-0.02em] group-hover:text-white/80 transition-colors" style={{ color: "rgba(230,240,255,0.85)", fontFamily: "var(--font-display)" }}>
                  {section.title}
                </h2>
              </button>
              <p className="text-[11px] mb-3 ml-6" style={{ color: "rgba(160,195,235,0.38)" }}>{section.subtitle}</p>

              {!isCollapsed && (
                <div className="flex flex-col gap-2">
                  {section.marks.map((m, i) => (
                    <MarkRow
                      key={m.id}
                      m={m}
                      font={section.varyFonts ? fonts[i % fonts.length] : defaultFont}
                      useFilledBg={section.useFilledBg}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
