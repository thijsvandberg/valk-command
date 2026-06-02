"use client";

import { useState, useRef, useCallback, useEffect, useMemo, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import { useOutsideClick } from "@/hooks/useOutsideClick";

interface DateTimePickerProps {
  /** "" | "YYYY-MM-DD" | "YYYY-MM-DDTHH:mm" — time is optional. */
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  placeholder?: string;
  /** Close the popover right after a day is picked (skips the time step). */
  closeOnSelect?: boolean;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parseValue(value: string): { date: Date | null; time: string } {
  if (!value) return { date: null, time: "" };
  const [datePart, timePart] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return { date: null, time: "" };
  return { date: new Date(y, m - 1, d), time: timePart ? timePart.slice(0, 5) : "" };
}

function fmtDatePart(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function combine(date: Date | null, time: string): string {
  if (!date) return "";
  const dp = fmtDatePart(date);
  return time ? `${dp}T${time}` : dp;
}

function sameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Human-readable label, e.g. "Tue 2 Jun 2026" or "Tue 2 Jun 2026 · 17:00". */
export function formatDateTimeLabel(value: string): string {
  const { date, time } = parseValue(value);
  if (!date) return "";
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short" });
  const rest = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return time ? `${weekday} ${rest} · ${time}` : `${weekday} ${rest}`;
}

// Normalize free-typed time into "HH:mm", or "" if not parseable.
function normalizeTime(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "").slice(0, 4);
  if (!digits) return "";
  let h: number;
  let m: number;
  if (digits.length <= 2) {
    h = Math.min(parseInt(digits, 10), 23);
    m = 0;
  } else {
    // 3 digits => H:MM (e.g. "930" -> 09:30); 4 digits => HH:MM.
    const split = digits.length === 3 ? 1 : 2;
    h = Math.min(parseInt(digits.slice(0, split), 10), 23);
    m = Math.min(parseInt(digits.slice(split), 10), 59);
  }
  return `${pad(h)}:${pad(m)}`;
}

function buildCalendarCells(viewYear: number, viewMonth: number): (Date | null)[] {
  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewYear, viewMonth, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const POPOVER_WIDTH = 288;
const POPOVER_EST_HEIGHT = 364;

export function DateTimePicker({ value, onChange, ariaLabel, placeholder = "Select date", closeOnSelect }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);

  const { date: selectedDate, time: selectedTime } = useMemo(() => parseValue(value), [value]);

  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState(() => {
    const base = selectedDate ?? today;
    return { year: base.getFullYear(), month: base.getMonth() };
  });
  // Local draft for the time field so partial typing isn't immediately normalized.
  const [timeDraft, setTimeDraft] = useState(selectedTime);

  useOutsideClick([triggerRef, popoverRef], () => setOpen(false), { enabled: open });

  const [coords, setCoords] = useState<{ top: number; left: number; placement: "top" | "bottom" } | null>(null);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const placement: "top" | "bottom" = spaceBelow < POPOVER_EST_HEIGHT && rect.top > spaceBelow ? "top" : "bottom";
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - POPOVER_WIDTH - 8);
    setCoords({
      top: placement === "bottom" ? rect.bottom + 6 : rect.top - 6,
      left,
      placement,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const base = selectedDate ?? today;
    setView({ year: base.getFullYear(), month: base.getMonth() });
    setTimeDraft(selectedTime);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cells = useMemo(() => buildCalendarCells(view.year, view.month), [view]);

  const goPrevMonth = useCallback(() => {
    setView((v) => (v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 }));
  }, []);
  const goNextMonth = useCallback(() => {
    setView((v) => (v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 }));
  }, []);

  const handlePickDay = useCallback((day: Date) => {
    onChange(combine(day, selectedTime));
    if (closeOnSelect) {
      setOpen(false);
    } else {
      timeInputRef.current?.focus();
    }
  }, [onChange, selectedTime, closeOnSelect]);

  const commitTime = useCallback(() => {
    const normalized = normalizeTime(timeDraft);
    setTimeDraft(normalized);
    if (selectedDate) onChange(combine(selectedDate, normalized));
  }, [timeDraft, selectedDate, onChange]);

  const clearTime = useCallback(() => {
    setTimeDraft("");
    if (selectedDate) onChange(combine(selectedDate, ""));
    timeInputRef.current?.focus();
  }, [selectedDate, onChange]);

  const clearAll = useCallback(() => {
    setTimeDraft("");
    onChange("");
    setOpen(false);
  }, [onChange]);

  const selectToday = useCallback(() => {
    const now = new Date();
    onChange(combine(now, timeDraft || selectedTime));
    setView({ year: now.getFullYear(), month: now.getMonth() });
  }, [onChange, timeDraft, selectedTime]);

  const label = formatDateTimeLabel(value);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`group flex w-full items-center gap-2 rounded-lg border bg-[var(--color-surface-elevated)] px-3 py-2 text-left text-body-sm cursor-pointer
          transition-colors duration-100
          ${open
            ? "border-[var(--color-brand-500)]/50 ring-1 ring-[var(--color-brand-500)]/30"
            : "border-border-default hover:border-border-strong"}`}
      >
        <Calendar
          size={13}
          strokeWidth={1.5}
          className={open ? "text-[var(--color-brand-400)]" : "text-text-muted group-hover:text-text-secondary"}
        />
        <span className={label ? "text-text-primary" : "text-text-muted"}>
          {label || placeholder}
        </span>
      </button>

      {open && coords && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={ariaLabel}
          style={{
            position: "fixed",
            top: coords.top,
            left: coords.left,
            width: POPOVER_WIDTH,
            transform: coords.placement === "top" ? "translateY(-100%)" : undefined,
            zIndex: 9999,
            animation: "fadeInUp 0.12s ease",
          }}
          className="rounded-xl border border-border-strong bg-[var(--color-surface-floating)] p-3 shadow-[var(--shadow-popover)]"
        >
          {/* Month navigation */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={goPrevMonth}
              aria-label="Previous month"
              className="rounded-md p-1 text-text-muted cursor-pointer hover:text-text-secondary hover:bg-overlay-default transition-colors duration-100"
            >
              <ChevronLeft size={15} strokeWidth={1.5} />
            </button>
            <span className="text-body-sm font-semibold text-text-primary">
              {MONTHS[view.month]} {view.year}
            </span>
            <button
              type="button"
              onClick={goNextMonth}
              aria-label="Next month"
              className="rounded-md p-1 text-text-muted cursor-pointer hover:text-text-secondary hover:bg-overlay-default transition-colors duration-100"
            >
              <ChevronRight size={15} strokeWidth={1.5} />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1 text-center text-[10px] font-medium text-text-muted">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} />;
              const isSelected = sameDay(day, selectedDate);
              const isToday = sameDay(day, today);
              return (
                <button
                  key={fmtDatePart(day)}
                  type="button"
                  onClick={() => handlePickDay(day)}
                  aria-pressed={isSelected}
                  className={`relative flex h-8 items-center justify-center rounded-md text-body-sm cursor-pointer transition-colors duration-100
                    ${isSelected
                      ? "bg-[var(--color-brand-500)] font-semibold text-white"
                      : "text-text-secondary hover:bg-overlay-default hover:text-text-primary"}`}
                >
                  {day.getDate()}
                  {isToday && !isSelected && (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[var(--color-brand-400)]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Time field (optional) */}
          <div className="mt-3 flex items-center gap-2 border-t border-border-default pt-3">
            <Clock size={13} strokeWidth={1.5} className="text-text-muted" />
            <span className="text-body-sm text-text-secondary">Time</span>
            <span className="text-[10px] text-text-muted">optional</span>
            <div className="relative ml-auto">
              <input
                ref={timeInputRef}
                type="text"
                inputMode="numeric"
                value={timeDraft}
                placeholder="--:--"
                disabled={!selectedDate}
                onChange={(e) => setTimeDraft(e.target.value)}
                onBlur={commitTime}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitTime();
                  }
                }}
                className="w-20 rounded-md border border-border-default bg-[var(--color-surface-elevated)] px-2 py-1 text-center text-body-sm tabular-nums text-text-primary
                  placeholder:text-text-muted
                  focus:border-[var(--color-brand-500)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]/30
                  disabled:opacity-40 disabled:cursor-not-allowed
                  transition-colors duration-100"
              />
              {timeDraft && (
                <button
                  type="button"
                  onClick={clearTime}
                  aria-label="Clear time"
                  className="absolute -right-1 -top-1 rounded-full bg-[var(--color-surface-floating)] p-0.5 text-text-muted cursor-pointer hover:text-text-secondary transition-colors duration-100"
                >
                  <X size={10} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>

          {/* Footer shortcuts */}
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={selectToday}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/10 transition-colors duration-100"
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                onClick={clearAll}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-text-muted cursor-pointer hover:text-text-secondary hover:bg-overlay-default transition-colors duration-100"
              >
                Clear
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
