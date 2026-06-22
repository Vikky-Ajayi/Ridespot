
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const variantClassName: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-white hover:bg-ink-soft active:bg-black disabled:bg-ink/50 disabled:text-white/75",
  secondary:
    "bg-canvas-subtle text-ink hover:bg-line active:bg-line-strong disabled:bg-canvas-subtle disabled:text-ink/45",
  ghost:
    "bg-transparent text-ink hover:bg-canvas-subtle active:bg-line disabled:text-ink/45",
  danger:
    "bg-danger text-white hover:bg-[#ff3636] active:bg-[#eb2f2f] disabled:bg-danger/50 disabled:text-white/75"
};

const sizeClassName: Record<ButtonSize, string> = {
  sm: "min-h-11 px-4 text-sm",
  md: "min-h-12 px-5 text-base",
  lg: "min-h-14 px-6 text-base"
};

export function Button({
  children,
  className,
  variant = "primary",
  size = "lg",
  fullWidth = false,
  loading = false,
  leadingIcon,
  trailingIcon,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-white",
        sizeClassName[size],
        variantClassName[variant],
        fullWidth && "w-full",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : leadingIcon}
      <span>{children}</span>
      {!loading ? trailingIcon : null}
    </button>
  );
}
