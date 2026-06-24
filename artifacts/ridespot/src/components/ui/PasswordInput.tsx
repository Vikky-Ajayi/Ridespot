

import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useId, useState } from "react";
import type { InputProps } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

export interface PasswordInputProps
  extends Omit<InputProps, "multiline" | "type" | "suffix" | "prefix"> {}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ label, error, hint, className, id, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <label className="block w-full space-y-3" htmlFor={inputId}>
        {label ? <span className="block text-sm font-medium text-ink">{label}</span> : null}
        <div className="grid grid-cols-[1fr_52px] overflow-hidden rounded-2xl bg-canvas-subtle shadow-[inset_0_0_0_1px_rgba(231,232,236,0.65)]">
          <input
            ref={ref}
            id={inputId}
            type={visible ? "text" : "password"}
            className={cn(
              "min-h-14 border-0 bg-transparent px-4 text-base text-ink outline-none placeholder:text-ink-muted/75",
              className
            )}
            {...props}
          />
          <button
            type="button"
            aria-label={visible ? "Hide password" : "Show password"}
            className="flex items-center justify-center border-l border-white bg-canvas-subtle text-ink-muted transition hover:text-ink"
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
        {error ? (
          <p className="text-sm font-medium text-danger">{error}</p>
        ) : hint ? (
          <p className="text-sm text-ink-muted">{hint}</p>
        ) : null}
      </label>
    );
  }
);
