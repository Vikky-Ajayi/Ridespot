import { ChevronDown } from "lucide-react";
import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  error?: string;
  options: Array<{ label: string; value: string }>;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  function SelectField({ label, error, options, className, id, ...props }, ref) {
    const generatedId = useId();
    const selectId = id ?? generatedId;

    return (
      <label className="block w-full space-y-3" htmlFor={selectId}>
        {label ? <span className="block text-sm font-medium text-ink">{label}</span> : null}
        <div className="grid min-h-14 grid-cols-[1fr_52px] overflow-hidden rounded-2xl bg-canvas-subtle shadow-[inset_0_0_0_1px_rgba(231,232,236,0.65)]">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              "border-0 bg-transparent px-4 text-base text-ink outline-none",
              className
            )}
            {...props}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="flex items-center justify-center border-l border-white text-ink-muted">
            <ChevronDown className="size-5" />
          </span>
        </div>
        {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
      </label>
    );
  }
);
