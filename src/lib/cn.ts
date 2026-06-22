/**
 * Tiny className joiner — filters falsy values and joins with a space.
 * Avoids pulling in a dependency (clsx/classnames) for what is a one-liner.
 */
export type ClassValue = string | number | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
