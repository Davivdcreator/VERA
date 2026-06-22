import { MapPinned } from "lucide-react";
import { Header } from "./components/Header";
import { CityMap } from "./components/CityMap";
import { PriorityQueue } from "./components/PriorityQueue";
import { WeightsPanel } from "./components/WeightsPanel";
import { AssetDetail } from "./components/AssetDetail";
import { SignalFeed } from "./components/SignalFeed";
import { DecisionLog } from "./components/DecisionLog";
import { Panel } from "./components/ui";

export default function App() {
  return (
    <div className="flex h-screen min-h-0 flex-col">
      <Header />

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 lg:grid-cols-12 lg:overflow-hidden">
        {/* Left: queue + policy */}
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-3">
          <div className="min-h-[280px] lg:min-h-0 lg:flex-[1.3]">
            <PriorityQueue />
          </div>
          <div className="min-h-[320px] lg:min-h-0 lg:flex-1">
            <WeightsPanel />
          </div>
        </div>

        {/* Center: operational picture + feed/log */}
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-6">
          <Panel
            title="Operational Picture"
            icon={<MapPinned className="h-4 w-4 text-sky-400" />}
            actions={<span className="text-[11px] text-slate-500">fused damage · live priority</span>}
            className="min-h-[420px] lg:min-h-0 lg:flex-[1.5]"
            bodyClassName="relative p-0"
          >
            <CityMap />
          </Panel>
          <div className="grid min-h-[300px] grid-cols-1 gap-3 md:grid-cols-2 lg:min-h-0 lg:flex-1">
            <SignalFeed />
            <DecisionLog />
          </div>
        </div>

        {/* Right: decision brief */}
        <div className="min-h-[520px] lg:col-span-3 lg:min-h-0">
          <AssetDetail />
        </div>
      </main>
    </div>
  );
}
