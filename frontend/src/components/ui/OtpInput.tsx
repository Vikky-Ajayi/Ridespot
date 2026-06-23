"use client";

import { cn } from "@/lib/utils";

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  className?: string;
  placeholder?: string;
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  className,
  placeholder = "--- ---"
}: OtpInputProps) {
  return (
    <input
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={length}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, length))}
      placeholder={placeholder}
      className={cn(
        "min-h-14 w-full rounded-2xl bg-canvas-subtle px-4 text-base tracking-[0.3em] text-ink shadow-[inset_0_0_0_1px_rgba(231,232,236,0.65)] outline-none placeholder:tracking-[0.18em] placeholder:text-ink-muted/75 focus:shadow-[inset_0_0_0_1px_rgba(19,214,110,0.5)]",
        className
      )}
      aria-label="One time password code"
    />
  );
}
