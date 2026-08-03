import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes
} from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface SharedProps {
  label?: string;
  error?: string;
  hint?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  multiline?: boolean;
  rows?: number;
}

type NativeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "prefix" | "size">;
type NativeTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "prefix" | "size"
>;

export type InputProps = SharedProps & NativeInputProps & NativeTextareaProps;

export const Input = forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps>(
  function Input(
    { className, label, error, hint, prefix, suffix, multiline, rows = 4, ...props },
    ref
  ) {
    const wrapperClassName = cn(
      "flex min-h-14 items-center overflow-hidden rounded-2xl bg-canvas-subtle px-4 text-ink shadow-[inset_0_0_0_1px_rgba(231,232,236,0.65)] transition focus-within:shadow-[inset_0_0_0_1px_rgba(19,214,110,0.5)]",
      multiline && "items-start py-4"
    );

    return (
      <label className="block w-full space-y-3">
        {label ? <span className="block text-sm font-medium text-ink">{label}</span> : null}
        <div className={wrapperClassName}>
          {prefix ? <span className="mr-3 text-ink-muted">{prefix}</span> : null}
          {multiline ? (
            <textarea
              ref={ref as React.ForwardedRef<HTMLTextAreaElement>}
              rows={rows}
              className={cn(
                "w-full resize-none border-0 bg-transparent p-0 text-base text-ink outline-none placeholder:text-ink-muted/75",
                className
              )}
              {...props}
            />
          ) : (
            <input
              ref={ref as React.ForwardedRef<HTMLInputElement>}
              className={cn(
                "w-full border-0 bg-transparent p-0 text-base text-ink outline-none placeholder:text-ink-muted/75",
                className
              )}
              {...props}
            />
          )}
          {suffix ? <span className="ml-3 text-ink-muted">{suffix}</span> : null}
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
