import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Dashboard } from "@/pages/Dashboard";
import { DangerZones } from "@/pages/DangerZones";
import { Analyses } from "@/pages/Analyses";
import { Reports } from "@/pages/Reports";
import { RepairQueue } from "@/pages/RepairQueue";

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/danger-zones" element={<DangerZones />} />
          <Route path="/analyses" element={<Analyses />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/repairs" element={<RepairQueue />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
