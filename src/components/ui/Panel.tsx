/**
 * Panel — generic card with header. DESIGN_SYSTEM.md §4.3.
 *
 * surface-1 background, subtle border, lg radius, overflow hidden.
 * Header: 48px tall, h3 title left, optional eyebrow (overline) + actions right.
 * Body: 16px (or 20px) padding. Optional footer.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface PanelProps {
  /** Card title (h3). Omit for a header-less panel. */
  title?: ReactNode;
  /** Small overline label above the title for grouping. */
  eyebrow?: ReactNode;
  /** Right-aligned header content (e.g. ghost icon buttons, controls). */
  actions?: ReactNode;
  /** Right-aligned footer content. */
  footer?: ReactNode;
  /** Use 20px body padding instead of the default 16px. */
  roomy?: boolean;
  /** Remove body padding entirely (e.g. when wrapping a flush table). */
  flushBody?: boolean;
  /** Extra classes on the outer panel. */
  className?: string;
  /** Extra classes on the body wrapper. */
  bodyClassName?: string;
  children?: ReactNode;
}

export function Panel({
  title,
  eyebrow,
  actions,
  footer,
  roomy = false,
  flushBody = false,
  className = "",
  bodyClassName = "",
  children,
}: PanelProps) {
  const hasHeader = title != null || eyebrow != null || actions != null;
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-lg border border-border-subtle bg-surface-1",
        className,
      )}
    >
      {hasHeader && (
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-4">
          <div className="flex min-w-0 flex-col justify-center">
            {eyebrow != null && (
              <span className="text-[11px] font-bold uppercase leading-none tracking-[0.08em] text-text-muted">
                {eyebrow}
              </span>
            )}
            {title != null && (
              <h3 className="truncate text-base font-semibold text-text-primary">
                {title}
              </h3>
            )}
          </div>
          {actions != null && (
            <div className="flex shrink-0 items-center gap-1">{actions}</div>
          )}
        </header>
      )}

      <div
        className={cn(
          "min-h-0 flex-1 text-text-secondary",
          !flushBody && (roomy ? "p-5" : "p-4"),
          bodyClassName,
        )}
      >
        {children}
      </div>

      {footer != null && (
        <footer className="flex h-12 shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-4">
          {footer}
        </footer>
      )}
    </section>
  );
}

export default Panel;
