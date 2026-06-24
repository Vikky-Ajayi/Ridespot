import type { ReactNode } from "react";

export interface AuthPageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
}

export function AuthPageHeader({ title, subtitle }: AuthPageHeaderProps) {
  return (
    <div className="space-y-3">
      <h1 className="[font-family:Inter,_system-ui,_sans-serif] text-[1.25rem] font-semibold leading-none tracking-[-0.08em] text-ink">
        {title}
      </h1>
      {subtitle ? (
        <p className="[font-family:Inter,_system-ui,_sans-serif] text-[0.875rem] font-medium leading-none tracking-[-0.03em] text-ink-muted">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
