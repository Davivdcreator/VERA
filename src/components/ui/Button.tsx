/**
 * Button — DESIGN_SYSTEM.md §4.4.
 *
 * Variants: primary | secondary | ghost | danger. Sizes: sm | md | lg.
 * Focus-visible always shows the 3px accent ring (never removed).
 */
import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold " +
  "transition-colors duration-150 ease-standard outline-none " +
  "focus-visible:shadow-[var(--shadow-focus)] " +
  "disabled:cursor-not-allowed";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: cn(
    "bg-accent text-text-inverse",
    "hover:bg-accent-hover active:bg-accent-pressed",
    "disabled:bg-surface-3 disabled:text-text-disabled",
  ),
  secondary: cn(
    "bg-surface-2 text-text-primary border border-border-default",
    "hover:bg-surface-3 hover:border-border-strong active:bg-surface-2",
    "disabled:text-text-disabled disabled:border-border-subtle",
  ),
  ghost: cn(
    "bg-transparent text-text-secondary",
    "hover:bg-surface-2 hover:text-text-primary active:bg-surface-3",
    "disabled:text-text-disabled",
  ),
  danger: cn(
    "bg-danger text-white",
    "hover:bg-[#F05559] active:bg-[#C93B40]",
    "disabled:bg-surface-3 disabled:text-text-disabled",
  ),
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-[30px] px-3 text-[13px]",
  md: "h-9 px-3.5 text-sm",
  lg: "h-11 px-4 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "md", className = "", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export default Button;
