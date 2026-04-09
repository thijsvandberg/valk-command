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
      <rect x="5" y="5" width="14" height="14" rx="3.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="5" r="1.5" fill="currentColor" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" />
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.5" />
    </svg>
  );
}
