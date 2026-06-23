/**
 * AppShell — DESIGN_SYSTEM.md §5.2.
 *
 * CSS grid: sidebar column + main column.
 *   grid-template-columns: 64px 1fr
 * Main content scrolls; sidebar is fixed in the grid.
 *
 * < lg the sidebar would become an off-canvas drawer (spec §5.3). For this
 * single-page build the sidebar is a persistent 64px icon rail at md+ and is
 * hidden below md, where navigation would move into a top-bar drawer. The
 * drawer itself is out of scope; the responsive grid tracks are wired so the
 * layout reflows correctly.
 */
import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="grid h-full bg-surface-0 md:grid-cols-[64px_1fr]">
      {/* Sidebar — column 1. Hidden below md. */}
      <div className="hidden min-h-0 md:block">
        <Sidebar className="h-full" />
      </div>

      {/* Main content — column 2, scrolls. */}
      <main className="col-span-full min-w-0 overflow-y-auto md:col-span-1">
        {children}
      </main>
    </div>
  );
}

export default AppShell;
