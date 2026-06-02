"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
  type RefObject,
  type CSSProperties,
} from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { createPortal } from "react-dom";
import { Check, Search } from "lucide-react";

// ---------------------------------------------------------------------------
// usePickerState hook
// ---------------------------------------------------------------------------

interface UsePickerStateOptions {
  portal?: boolean;
  align?: "left" | "right";
  popoverHeight?: number;
  onOpen?: () => void;
  onClose?: () => void;
}

interface PickerPosition {
  top: number;
  left: number;
  flipUp: boolean;
}

export interface UsePickerStateReturn {
  open: boolean;
  pos: PickerPosition | null;
  triggerRef: RefObject<HTMLButtonElement | null>;
  popoverRef: RefObject<HTMLDivElement | null>;
  handleOpen: () => void;
  handleClose: () => void;
  getPopoverStyle: () => CSSProperties;
}

export function usePickerState(opts: UsePickerStateOptions = {}): UsePickerStateReturn {
  const {
    portal = true,
    align = "right",
    popoverHeight = 300,
    onOpen,
    onClose,
  } = opts;

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PickerPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const flipUp = rect.bottom + popoverHeight > window.innerHeight;
    setPos({
      top: flipUp ? rect.top : rect.bottom + 4,
      left: align === "left" ? rect.left : rect.right,
      flipUp,
    });
  }, [align, popoverHeight]);

  const handleOpen = useCallback(() => {
    if (portal) updatePosition();
    setOpen(true);
    onOpen?.();
  }, [portal, updatePosition, onOpen]);

  const handleClose = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);

  useOutsideClick([triggerRef, popoverRef], () => { setOpen(false); onClose?.(); }, { enabled: open });

  // Scroll repositioning (portal mode only)
  useEffect(() => {
    if (!open || !portal) return;
    function onScroll() { updatePosition(); }
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open, portal, updatePosition]);

  const getPopoverStyle = useCallback((): CSSProperties => {
    if (!pos) return {};
    return {
      top: pos.flipUp ? undefined : pos.top,
      bottom: pos.flipUp ? window.innerHeight - pos.top + 4 : undefined,
      left: align === "left" ? pos.left : undefined,
      right: align === "right" ? window.innerWidth - pos.left : undefined,
      backgroundColor: "var(--color-surface-floating)",
      boxShadow: "0 4px 16px rgba(0,0,0,0.20), 0 1px 4px rgba(0,0,0,0.10)",
    };
  }, [pos, align]);

  return { open, pos, triggerRef, popoverRef, handleOpen, handleClose, getPopoverStyle };
}

// ---------------------------------------------------------------------------
// BasePicker Context
// ---------------------------------------------------------------------------

interface BasePickerContextValue {
  open: boolean;
  query: string;
  setQuery: (q: string) => void;
  handleOpen: () => void;
  handleClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  popoverRef: RefObject<HTMLDivElement | null>;
  searchRef: RefObject<HTMLInputElement | null>;
  pos: PickerPosition | null;
  portal: boolean;
  align: "left" | "right";
  getPopoverStyle: () => CSSProperties;
}

const BasePickerContext = createContext<BasePickerContextValue | null>(null);

function useBasePickerContext() {
  const ctx = useContext(BasePickerContext);
  if (!ctx) throw new Error("BasePicker compound components must be used within BasePicker.Root");
  return ctx;
}

// ---------------------------------------------------------------------------
// BasePicker.Root
// ---------------------------------------------------------------------------

interface RootProps {
  children: ReactNode;
  portal?: boolean;
  align?: "left" | "right";
  popoverHeight?: number;
  onOpenChange?: (open: boolean) => void;
}

function Root({
  children,
  portal = true,
  align = "right",
  popoverHeight = 300,
  onOpenChange,
}: RootProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  const pickerState = usePickerState({
    portal,
    align,
    popoverHeight,
    onOpen: () => {
      setQuery("");
      onOpenChange?.(true);
      requestAnimationFrame(() => searchRef.current?.focus());
    },
    onClose: () => {
      setQuery("");
      onOpenChange?.(false);
    },
  });

  const value: BasePickerContextValue = {
    ...pickerState,
    query,
    setQuery,
    searchRef,
    portal,
    align,
  };

  if (!portal) {
    return (
      <BasePickerContext.Provider value={value}>
        <div className="relative">{children}</div>
      </BasePickerContext.Provider>
    );
  }

  return (
    <BasePickerContext.Provider value={value}>
      {children}
    </BasePickerContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// BasePicker.Trigger
// ---------------------------------------------------------------------------

interface TriggerProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: ReactNode | ((props: { open: boolean }) => ReactNode);
}

function Trigger({ children, ...rest }: TriggerProps) {
  const { open, handleOpen, handleClose, triggerRef } = useBasePickerContext();

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => (open ? handleClose() : handleOpen())}
      aria-expanded={open}
      {...rest}
    >
      {typeof children === "function" ? children({ open }) : children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// BasePicker.Popover
// ---------------------------------------------------------------------------

interface PopoverProps {
  children: ReactNode;
  width?: string;
  className?: string;
  style?: CSSProperties;
  header?: ReactNode;
  footer?: ReactNode;
}

function PickerPopover({ children, width = "w-[240px]", className, style, header, footer }: PopoverProps) {
  const { open, pos, popoverRef, portal, align, getPopoverStyle } = useBasePickerContext();

  if (!open) return null;
  if (portal && !pos) return null;

  const content = (
    <div
      ref={popoverRef}
      className={`${portal ? "fixed z-[9999]" : `absolute top-full ${align === "left" ? "left-0" : "right-0"} z-50 mt-1.5`} ${width} rounded-xl border border-border-default bg-[var(--color-surface-floating)]${className ? ` ${className}` : ""}`}
      style={portal ? { ...getPopoverStyle(), ...style } : style}
    >
      {header}
      {children}
      {footer}
    </div>
  );

  if (portal) {
    if (typeof document === "undefined") return null;
    return createPortal(content, document.body);
  }
  return content;
}

// ---------------------------------------------------------------------------
// BasePicker.Search
// ---------------------------------------------------------------------------

interface SearchProps {
  placeholder?: string;
  actions?: ReactNode;
  onChange?: (value: string) => void;
}

function PickerSearch({ placeholder = "Search...", actions, onChange }: SearchProps) {
  const { query, setQuery, searchRef } = useBasePickerContext();

  return (
    <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
      <Search size={12} strokeWidth={1.5} className="shrink-0 text-text-muted" />
      <input
        ref={searchRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange?.(e.target.value);
        }}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-body-sm text-text-secondary placeholder:text-text-muted focus:outline-none"
      />
      {actions}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BasePicker.List
// ---------------------------------------------------------------------------

interface ListProps {
  children: ReactNode;
  maxHeight?: string;
  className?: string;
}

function List({ children, maxHeight = "max-h-[260px]", className }: ListProps) {
  return (
    <div className={`${maxHeight} overflow-y-auto py-1${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BasePicker.Item
// ---------------------------------------------------------------------------

interface ItemProps {
  children: ReactNode;
  selected?: boolean;
  onSelect: () => void;
  className?: string;
  style?: CSSProperties;
  // Render as a div with button semantics instead of a real <button>. Use when
  // the item embeds its own interactive elements (e.g. a link), since a nested
  // <a> inside a <button> is invalid HTML.
  asDiv?: boolean;
}

function Item({ children, selected, onSelect, className, style, asDiv }: ItemProps) {
  const cls = `flex w-full items-center gap-2.5 px-3 py-[7px] text-body-sm cursor-pointer hover:bg-hover-list-item active:bg-overlay-default${className ? ` ${className}` : ""}`;
  const inner = (
    <>
      {children}
      {selected && (
        <Check size={11} strokeWidth={1.5} className="shrink-0 ml-auto text-[var(--color-brand-400)]" />
      )}
    </>
  );

  if (asDiv) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cls}
        style={style}
      >
        {inner}
      </div>
    );
  }

  return (
    <button type="button" onClick={onSelect} className={cls} style={style}>
      {inner}
    </button>
  );
}

// ---------------------------------------------------------------------------
// BasePicker.Empty
// ---------------------------------------------------------------------------

interface EmptyProps {
  children: ReactNode;
}

function Empty({ children }: EmptyProps) {
  return (
    <p className="px-3 py-2 text-body-sm text-text-muted">{children}</p>
  );
}

// ---------------------------------------------------------------------------
// BasePicker.Section
// ---------------------------------------------------------------------------

interface SectionProps {
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

function Section({ children, icon, className }: SectionProps) {
  return (
    <div className={`flex items-center gap-1.5 px-3 pt-1.5 pb-0.5${className ? ` ${className}` : ""}`}>
      {icon}
      <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-text-muted">
        {children}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BasePicker.Divider
// ---------------------------------------------------------------------------

function Divider() {
  return <div className="mx-3 my-1 border-t border-border-subtle" />;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const BasePicker = {
  Root,
  Trigger,
  Popover: PickerPopover,
  Search: PickerSearch,
  List,
  Item,
  Empty,
  Section,
  Divider,
  useContext: useBasePickerContext,
};
