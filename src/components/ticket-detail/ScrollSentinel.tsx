"use client";

import { useRef, useEffect } from "react";

interface ScrollSentinelProps {
  onIntersect: () => void;
  disabled: boolean;
}

export function ScrollSentinel({ onIntersect, disabled }: ScrollSentinelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onIntersect);

  useEffect(() => {
    callbackRef.current = onIntersect;
  }, [onIntersect]);

  useEffect(() => {
    if (disabled || !ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) callbackRef.current();
      },
      { threshold: 0.1 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [disabled]);

  return <div ref={ref} className="h-1" />;
}
