interface BridgeMarkProps {
  size?: number;
  className?: string;
}

export function BridgeMark({ size = 18, className }: BridgeMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Bridge deck */}
      <rect x="2" y="13" width="20" height="2" rx="0.5" fill="currentColor" opacity="0.95" />
      {/* Left pillar */}
      <rect x="5" y="8" width="2.5" height="9" rx="0.5" fill="currentColor" opacity="0.7" />
      {/* Right pillar */}
      <rect x="16.5" y="8" width="2.5" height="9" rx="0.5" fill="currentColor" opacity="0.7" />
      {/* Arch / suspension curve */}
      <path
        d="M5 10C5 10 8.5 4 12 4C15.5 4 19 10 19 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      {/* Left cable */}
      <line x1="8.5" y1="6.5" x2="8.5" y2="13" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      {/* Center cable */}
      <line x1="12" y1="4.5" x2="12" y2="13" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      {/* Right cable */}
      <line x1="15.5" y1="6.5" x2="15.5" y2="13" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}
