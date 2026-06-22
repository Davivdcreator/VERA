import { Pause, Play, Radio, ShieldCheck, Waves } from "lucide-react";
import { useVeraStore } from "@/store/useVeraStore";
import { SCENARIO } from "@/data/seed";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Pill } from "./ui";

export function Header() {
  const live = useVeraStore((s) => s.live);
  const toggleLive = useVeraStore((s) => s.toggleLive);
  const signalCount = useVeraStore((s) => s.signals.length);
  const decisions = useVeraStore((s) => s.decisions.length);

  return (
    <header className="flex items-center justify-between gap-4 border-b border-[var(--color-edge)] bg-[var(--color-panel)]/70 px-5 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-sky-400 to-cyan-600 shadow-lg shadow-sky-900/40">
          <ShieldCheck className="h-5 w-5 text-slate-950" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-bold tracking-tight text-white">VERA</h1>
            <span className="text-[11px] text-slate-400">
              Verified Emergency Resource Allocation
            </span>
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Waves className="h-3 w-3 text-sky-400" />
            {SCENARIO.name} · {SCENARIO.event} · T+{SCENARIO.hoursSinceEvent}h
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Pill className="bg-slate-800/60 text-slate-300">
          {signalCount} signals
        </Pill>
        <Pill className="bg-slate-800/60 text-slate-300">{decisions} decisions</Pill>
        <Pill
          className={
            isSupabaseConfigured
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-slate-800/60 text-slate-400"
          }
        >
          <Radio className="h-3 w-3" />
          {isSupabaseConfigured ? "Supabase live" : "Local simulator"}
        </Pill>

        <button
          onClick={toggleLive}
          className={`ml-1 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition ${
            live
              ? "bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40 hover:bg-rose-500/30"
              : "bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/40 hover:bg-sky-500/30"
          }`}
        >
          {live ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {live ? "Pause feed" : "Start live feed"}
          {live && (
            <span className="relative ml-0.5 flex h-2 w-2">
              <span className="vera-ping absolute inline-flex h-2 w-2 rounded-full bg-rose-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-400" />
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
