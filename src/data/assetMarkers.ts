/**
 * Geo-located asset markers for the map overlay.
 *
 * The dashboard table (REPAIR_PRIORITIES) tracks asset *state* but carries no
 * coordinates, so nothing could be plotted on the map. Here we attach a real
 * Kyiv lat/lng to each asset (by district / known location) so the map can
 * render a state-colored pin per asset — making the "Asset State" legend real.
 */
import type { InfraStatus } from "@/components/ui/StatusBadge";
import { REPAIR_PRIORITIES } from "./dashboardData";

export interface AssetMarker {
  id: string;
  name: string;
  district: string;
  state: InfraStatus;
  lat: number;
  lng: number;
}

/** Asset id → location within the Kyiv metro area. */
const ASSET_COORDS: Record<string, { lat: number; lng: number }> = {
  "UA-KYV-0192": { lat: 50.4308, lng: 30.5665 }, // Paton Bridge, Pechersk
  "UA-KYV-0044": { lat: 50.402, lng: 30.73 }, // Bortnychi Aeration Station, Darnytsia
  "UA-KYV-0210": { lat: 50.515, lng: 30.498 }, // Substation Pivnichna, Obolon
  "UA-KYV-0007": { lat: 50.467, lng: 30.517 }, // Dnipro Water Main, Podil
  "UA-KYV-0451": { lat: 50.425, lng: 30.54 }, // Traffic Grid, Pechersk
  "UA-KYV-0033": { lat: 50.45, lng: 30.61 }, // Darnytsia Rail Bridge, Dniprovskyi
  "UA-KYV-0118": { lat: 50.52, lng: 30.515 }, // Feeder Line, Obolon
};

/** Markers derived from the live priority list (single source of truth for state). */
export const ASSET_MARKERS: AssetMarker[] = REPAIR_PRIORITIES.flatMap((p) => {
  const coords = ASSET_COORDS[p.id];
  if (!coords) return [];
  return [
    {
      id: p.id,
      name: p.asset,
      district: p.district,
      state: p.state,
      lat: coords.lat,
      lng: coords.lng,
    },
  ];
});

/** Infrastructure-state → marker color (matches the light-theme status tokens). */
export const STATE_COLOR: Record<InfraStatus, string> = {
  operational: "#1F9D58",
  degraded: "#B9791C",
  offline: "#D23B40",
  unknown: "#64728C",
};
