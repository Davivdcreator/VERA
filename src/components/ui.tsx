import type { ReactNode } from "react";

/** A titled panel — the basic card used across the ops console. */
export function Panel({
  title,
  icon,
  actions,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col rounded-xl border border-[var(--color-edge)] bg-[var(--color-panel)]/80 backdrop-blur ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-[var(--color-edge)] px-3.5 py-2.5">
          <div className="flex items-center gap-2 text-[13px] font-semibold tracking-wide text-slate-200">
            {icon}
            {title}
          </div>
          {actions}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** Horizontal progress/meter bar. */
export function Bar({
  value,
  color = "#38bdf8",
  track = "rgba(148,163,184,0.15)",
  height = 6,
}: {
  value: number; // 0..1
  color?: string;
  track?: string;
  height?: number;
}) {
  return (
    <div
      className="w-full overflow-hidden rounded-full"
      style={{ height, background: track }}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color }}
      />
    </div>
  );
}

export function Pill({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      {children}
    </span>
  );
}
