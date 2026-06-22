/**
 * Shared types for VERA damage-detection events.
 *
 * A DamageEvent represents an estimated damage zone (centre + radius) derived
 * from fused signals (FIRMS satellite fire detections and/or Telegram reports),
 * plus the infrastructure assets that fall inside the zone.
 *
 * Column names in `damage_events` (SQL, snake_case) map 1-to-1 to the fields
 * below. The `evidence` and `affected` JSONB columns deserialise directly to
 * DamageEvidence[] and AffectedAsset[] respectively.
 */

/** Origin of the damage detection. Mirrors the `damage_source` Postgres enum. */
export type DamageSource = "firms" | "telegram" | "fused" | "sample";

/** An infrastructure asset that lies within the damage zone. */
export interface AffectedAsset {
  /** References `assets.id`. */
  assetId: string;
  name: string;
  type: string;
  /** Estimated damage intensity for this asset (0–1). */
  estDamage: number;
  /** Distance from the zone centre to the asset, in metres. */
  distanceM: number;
}

/** A single piece of evidence backing a damage event. */
export interface DamageEvidence {
  source: "firms" | "telegram";
  /** Human-readable detail: FIRMS frp/brightness, Telegram excerpt, etc. */
  detail: string;
  /** Optional deep-link to the Telegram message or FIRMS record. */
  url?: string;
  /** ISO-8601 timestamp of the underlying signal. */
  ts?: string;
}

/**
 * Full damage event — mirrors the `damage_events` table row.
 * Dates arrive as ISO-8601 strings from PostgREST.
 */
export interface DamageEvent {
  /** uuid — `damage_events.id` */
  id: string;
  /** Zone centre latitude — `damage_events.lat` */
  lat: number;
  /** Zone centre longitude — `damage_events.lng` */
  lng: number;
  /** Estimated damage radius in metres — `damage_events.radius_m` */
  radius_m: number;
  /** Damage intensity 0–1 — `damage_events.severity` */
  severity: number;
  /** Source-agreement score 0–1 — `damage_events.confidence` */
  confidence: number;
  /** Detection origin — `damage_events.source` */
  source: DamageSource;
  /** Short human-readable title, e.g. "Strike near Kyiv CHP-5" */
  title: string;
  /** One-line summary — `damage_events.summary` */
  summary?: string;
  /** Matched keywords that triggered detection — `damage_events.keywords` */
  keywords: string[];
  /** Raw evidence records (FIRMS + Telegram) — `damage_events.evidence` */
  evidence: DamageEvidence[];
  /** Affected assets inside the zone — `damage_events.affected` */
  affected: AffectedAsset[];
  /** ISO-8601 detection timestamp — `damage_events.detected_at` */
  detected_at: string;
}

/**
 * Minimal projection of a DamageEvent for the map layer.
 * Contains only the fields needed to draw damage-zone circles and colour them.
 */
export interface DamageZone {
  id: string;
  lat: number;
  lng: number;
  radius_m: number;
  severity: number;
  source: DamageSource;
}
