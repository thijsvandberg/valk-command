"use client";

interface TitleInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function TitleInput({ value, onChange, placeholder = "Story title..." }: TitleInputProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-transparent px-4 pt-4 pb-1 font-[var(--font-display)] text-[1.35rem] font-semibold leading-snug tracking-tight text-text-primary placeholder:text-text-muted focus:outline-none"
    />
  );
}
