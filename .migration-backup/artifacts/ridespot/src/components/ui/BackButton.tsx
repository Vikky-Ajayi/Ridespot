import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BackButtonProps {
  href?: string;
  className?: string;
  label?: string;
}

export function BackButton({
  href = "#",
  className,
  label = "Back"
}: BackButtonProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1 rounded-xl bg-canvas-subtle px-3 text-sm font-medium text-ink-muted transition hover:bg-line hover:text-ink",
        className
      )}
    >
      <ChevronLeft className="size-4" />
      <span>{label}</span>
    </Link>
  );
}
