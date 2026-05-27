"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { TextInput } from "@/components/shared/TextInput";

export function ExpandableSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (q: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isOpen = expanded || value.length > 0;

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node) && !value) {
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, value]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          setExpanded(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-hover-list-item cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "color 120ms, background-color 120ms" }}
        title="Search tickets"
      >
        <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative flex items-center shrink-0">
      <TextInput
        ref={inputRef}
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (!value) setExpanded(false);
        }}
        placeholder="Search tickets..."
        icon={<Search className="h-3.5 w-3.5" strokeWidth={1.5} />}
        className="h-8 w-52 pr-8"
        style={{ boxShadow: "inset 0 1px 2px rgba(0,0,0,0.18)" }}
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className="absolute right-2.5 flex h-4 w-4 items-center justify-center rounded-full text-text-tertiary hover:text-text-secondary cursor-pointer"
          style={{ backgroundColor: "var(--color-overlay-default)" }}
        >
          <X className="h-2.5 w-2.5" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
