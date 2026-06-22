/**
 * IconButton — square ghost icon button. DESIGN_SYSTEM.md §4.4 (icon-only)
 * and §4.7 (map zoom/tilt controls).
 *
 * aria-label is required (icon-only buttons must be labelled for a11y).
 */
import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type IconButtonSize = "sm" | "md";

const SIZES: Record<IconButtonSize, string> = {
  sm: "h-8 w-8", // 32x32 — map chrome controls
  md: "h-9 w-9", // 36x36 — panel header actions
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required — icon-only controls must be labelled. */
  "aria-label": string;
  size?: IconButtonSize;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = "md", className = "", type = "button", children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-text-secondary",
        "transition-colors duration-150 ease-standard outline-none",
        "hover:bg-surface-3 hover:text-text-primary active:bg-surface-2",
        "focus-visible:shadow-[var(--shadow-focus)]",
        "disabled:cursor-not-allowed disabled:text-text-disabled",
        SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = "IconButton";

export default IconButton;
