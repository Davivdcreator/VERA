// VERA — run-analysis edge function.
//
// Flow: receive an asset -> build a rebuild-cost prompt (schema embedded) ->
// call Qwen via OpenRouter in json_object mode -> validate (+ one repair retry)
// -> persist to the `analyses` table with the service role -> return { id, report }.
//
// Secrets required (set with `supabase secrets set`):
//   OPENROUTER_API_KEY   (required)
//   OPENROUTER_MODEL     (optional, default qwen/qwen3-next-80b-a3b-instruct:free)
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "./cors.ts";
import { type RebuildCostReport } from "./schema.ts";
import { validateRebuildEstimate } from "./validate.ts";
import { buildMessages, type AssetContext } from "./prompt.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "qwen/qwen3-next-80b-a3b-instruct:free";

interface RequestBody {
  kind?: "rebuild_cost";
  asset?: AssetContext;
  currency?: string;
}

// Pull the first balanced JSON object out of a string (handles stray prose or
// code fences from models that don't fully honour response_format).
function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    if (start === -1) throw new Error("Model output contained no JSON object.");
    for (let end = trimmed.length; end > start; end--) {
      if (trimmed[end - 1] !== "}") continue;
      try {
        return JSON.parse(trimmed.slice(start, end));
      } catch {
        /* keep shrinking */
      }
    }
    throw new Error("Model output did not contain valid JSON.");
  }
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  // deno-lint-ignore no-explicit-any
  messages: any[],
  jsonMode = true,
  rateRetry = true,
): Promise<string> {
  // The full JSON Schema is embedded in the system prompt (prompt.ts), so we use
  // the widely-supported json_object mode rather than strict json_schema (not all
  // free providers accept it) and fall back to a plain completion if rejected.
  // deno-lint-ignore no-explicit-any
  const payload: Record<string, any> = { model, messages, temperature: 0.2 };
  if (jsonMode) payload.response_format = { type: "json_object" };

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://vera.local",
      "X-Title": "VERA Rebuild Cost",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // A free provider that rejects response_format -> drop it and retry (the
    // schema is already embedded in the prompt).
    if (jsonMode && (res.status === 400 || res.status === 422)) {
      return callOpenRouter(apiKey, model, messages, false, rateRetry);
    }
    // Free-tier upstream rate limit -> wait the suggested delay once, then retry.
    if (res.status === 429 && rateRetry) {
      const wait = Math.min(Number(data?.error?.metadata?.retry_after_seconds) || 5, 25);
      await new Promise((r) => setTimeout(r, Math.ceil((wait + 1) * 1000)));
      return callOpenRouter(apiKey, model, messages, jsonMode, false);
    }
    const errObj = data?.error ?? data ?? { message: `OpenRouter HTTP ${res.status}` };
    throw new Error(typeof errObj === "string" ? errObj : JSON.stringify(errObj));
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenRouter returned an empty completion.");
  }
  return content;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) return json({ error: "OPENROUTER_API_KEY is not configured on the function." }, 500);
  const model = Deno.env.get("OPENROUTER_MODEL") ?? DEFAULT_MODEL;

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const asset = body.asset;
  if (!asset?.id || !asset?.name) {
    return json({ error: "Request must include asset.id and asset.name." }, 400);
  }
  const currency = (body.currency ?? "USD").toUpperCase();
  const basisDate = new Date().toISOString().slice(0, 10);

  // Call the model, validate, and retry once with the validation errors fed back.
  const messages = buildMessages(asset, currency, basisDate);
  let report: RebuildCostReport | null = null;
  let lastErrors: string[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      raw = await callOpenRouter(apiKey, model, messages);
    } catch (err) {
      return json({ error: "Model call failed.", detail: err instanceof Error ? err.message : String(err) }, 502);
    }

    let parsed: unknown;
    try {
      parsed = extractJson(raw);
    } catch (err) {
      lastErrors = [err instanceof Error ? err.message : String(err)];
      messages.push({ role: "assistant", content: raw });
      messages.push({ role: "user", content: `That was not valid JSON (${lastErrors[0]}). Return ONLY the JSON object that matches the schema.` });
      continue;
    }

    lastErrors = validateRebuildEstimate(parsed);
    if (lastErrors.length === 0) {
      report = parsed as RebuildCostReport;
      break;
    }

    messages.push({ role: "assistant", content: JSON.stringify(parsed) });
    messages.push({
      role: "user",
      content:
        `The JSON had these problems:\n- ${lastErrors.join("\n- ")}\n` +
        `Fix them and return ONLY the corrected JSON object. Keep numbers numeric and ensure low <= expected <= high everywhere.`,
    });
  }

  if (!report) {
    return json({ error: "Could not produce a valid estimate.", detail: lastErrors.join("; ") }, 422);
  }

  // Persist with the service role (bypasses RLS). Denormalize headline numbers.
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let savedId: string | null = null;
  if (supabaseUrl && serviceKey) {
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data, error } = await supabase
      .from("analyses")
      .insert({
        asset_id: asset.id,
        asset_name: asset.name,
        asset_type: asset.type ?? null,
        kind: "rebuild_cost",
        schema_version: report.schema_version,
        summary: report.summary,
        result: report,
        currency: report.total_program_cost?.currency ?? null,
        cost_low: report.total_program_cost?.low ?? null,
        cost_expected: report.total_program_cost?.expected ?? null,
        cost_high: report.total_program_cost?.high ?? null,
        confidence: report.target_cost?.confidence ?? null,
        model,
      })
      .select("id")
      .single();
    if (error) {
      // Don't fail the whole request if persistence hiccups — return the report.
      console.error("[run-analysis] insert failed:", error.message);
    } else {
      savedId = data?.id ?? null;
    }
  }

  return json({ id: savedId, report, model });
});
