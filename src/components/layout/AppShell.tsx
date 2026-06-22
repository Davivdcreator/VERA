/**
 * AppShell — DESIGN_SYSTEM.md §5.2.
 *
 * CSS grid: sidebar column + main column, top bar spanning row 1.
 *   grid-template-columns: 240px 1fr  (64px sidebar at lg, full 240 at xl+)
 *   grid-template-rows:    56px 1fr
 * Main content scrolls; sidebar and top bar are fixed in the grid.
 *
 * < lg the sidebar would become an off-canvas drawer (spec §5.3). For this
 * single-page build the sidebar collapses to a 64px icon rail at lg and is
 * hidden below md, where navigation would move into a top-bar drawer. The
 * drawer itself is out of scope; the responsive grid tracks are wired so the
 * layout reflows correctly.
 */
import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="grid h-full grid-rows-[56px_1fr] bg-surface-0 md:grid-cols-[64px_1fr] xl:grid-cols-[240px_1fr]">
      {/* Top bar — spans all columns (row 1). */}
      <div className="md:col-span-2">
        <Topbar />
      </div>

      {/* Sidebar — column 1, row 2. Hidden below md. */}
      <div className="hidden min-h-0 md:block">
        <Sidebar className="h-full" />
      </div>

      {/* Main content — column 2, row 2, scrolls. */}
      <main className="col-span-full min-w-0 overflow-y-auto md:col-span-1">
        {children}
      </main>
    </div>
  );
}

export default AppShell;
