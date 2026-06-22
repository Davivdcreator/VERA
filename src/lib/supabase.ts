import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Optional Supabase backend.
 *
 * VERA runs fully on the in-browser simulator with no backend at all (ideal for
 * a demo). Provide VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env to switch
 * on a real Postgres + Realtime data plane. The schema lives in
 * supabase/migrations/0001_init.sql.
 *
 * To go live, replace startSimulator() in the store with a Realtime channel:
 *
 *   supabase
 *     .channel("signals")
 *     .on("postgres_changes",
 *         { event: "INSERT", schema: "public", table: "signals" },
 *         (payload) => useVeraStore.getState().ingest(rowToSignal(payload.new)))
 *     .subscribe();
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : null;
