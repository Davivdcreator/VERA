import { formatDistanceToNowStrict } from "date-fns";

export function timeAgo(ts: number): string {
  return formatDistanceToNowStrict(ts, { addSuffix: true });
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function compactNumber(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(n);
}
