/**
 * SegmentedControl — DESIGN_SYSTEM.md §4.6.
 *
 * Used to switch a map panel between 2D and 3D. Container surface-2 / default
 * border / md radius / 2px padding / 32px tall. Active segment uses the
 * accent-soft fill + accent text variant (the recommended one). Arrow-key
 * navigable (role="radiogroup").
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Optional leading icon (14px lucide). */
  icon?: ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  "aria-label": string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = "",
  ...rest
}: SegmentedControlProps<T>) {
  const ariaLabel = rest["aria-label"];

  const move = (dir: 1 | -1) => {
    const idx = options.findIndex((o) => o.value === value);
    if (idx === -1) return;
    const next = (idx + dir + options.length) % options.length;
    onChange(options[next].value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-8 items-center gap-0.5 rounded-md border border-border-default bg-surface-2 p-0.5",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(-1);
              }
            }}
            className={cn(
              "tabular inline-flex h-full items-center gap-1.5 rounded-sm px-3 font-mono text-xs font-medium leading-none",
              "transition-colors duration-150 ease-standard outline-none",
              "focus-visible:shadow-[var(--shadow-focus)]",
              active
                ? "bg-accent-soft text-accent"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
