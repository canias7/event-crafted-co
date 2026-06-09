// flatlay-generate — Stage 3 of the flat-lay engine.
//
// POST { prompt, save?: boolean }
//   1. asks Claude (claude-sonnet-4-6) for a partial FlatLaySpec JSON
//      using FLATLAY_SPEC_PROMPT
//   2. merges it over the defaults (withDefaults)
//   3. composes the flat-lay HTML (composeFlatLay)
//   4. optionally saves a row to ai_sites (served at /s/<slug>)
//   → { slug, title, html_len, url }   (or { html } when save=false)
//
// The heavy design/markup is deterministic (the engine); the LLM only writes
// the couple-specific content. Fast + consistent vs. the LLM-writes-HTML path.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { composeFromPartial, FLATLAY_SPEC_PROMPT } from "../_shared/flatlay_spec.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = "claude-sonnet-4-6";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

// Pull the first balanced {...} JSON object out of the model text.
function extractJson(text: string): any | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "bad_json" }); }
  const prompt = String(body?.prompt ?? "").trim();
  const save = body?.save !== false; // default true

  // Direct path: caller supplies a (partial) spec — skip the LLM entirely.
  // Used by the builder form, and for generating without an LLM call.
  if (body?.spec && typeof body.spec === "object") {
    const partial = body.spec;
    return await finish(partial, prompt || "(spec)", save);
  }
  if (!prompt) return json(400, { error: "missing_prompt_or_spec" });

  // Spec response cache: an identical (model + system prompt + request) reuses
  // the LLM's spec instead of paying for another call. Keying on the system
  // prompt means improving FLATLAY_SPEC_PROMPT self-invalidates the cache.
  // Best-effort — cache failures never block generation.
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const cacheKey = await sha256(`${MODEL}\n${FLATLAY_SPEC_PROMPT}\n${prompt}`);
  let partial: any = null;
  let cached = false;
  try {
    const { data: hit } = await db
      .from("flatlay_spec_cache")
      .select("spec")
      .eq("prompt_hash", cacheKey)
      .maybeSingle();
    if (hit?.spec) { partial = hit.spec; cached = true; }
  } catch { /* cache is optional */ }

  if (!partial) {
    // LLM → partial spec
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "extended-cache-ttl-2025-04-11",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 6000,
        system: [{ type: "text", text: FLATLAY_SPEC_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } }],
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return json(502, { error: `anthropic_${res.status}`, detail: t.slice(0, 300) });
    }
    const data = await res.json();
    const text = (data?.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    partial = extractJson(text);
    if (!partial) return json(502, { error: "spec_parse_failed", raw: text.slice(0, 400) });
    try {
      await db.from("flatlay_spec_cache").upsert({ prompt_hash: cacheKey, spec: partial, model: MODEL });
    } catch { /* cache is optional */ }
  }

  return await finish(partial, prompt, save, cached);
});

// slug + title → compose → optionally save → response (shared by both paths)
async function finish(partial: any, prompt: string, save: boolean, cached = false): Promise<Response> {
  const name1 = partial.name1 ?? "Our";
  const name2 = partial.name2 ?? "Wedding";
  const title = `${name1} & ${name2}`;
  const slug = `${slugify(`${name1}-${name2}`)}-${Math.random().toString(36).slice(2, 8)}`;
  partial.slug = slug;

  let html: string;
  try { html = composeFromPartial(partial); }
  catch (e) { return json(500, { error: "compose_failed", detail: String(e).slice(0, 300) }); }

  if (save) {
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await db.from("ai_sites").insert({ slug, title, prompt, html });
    if (error) return json(500, { error: "db_insert_failed", detail: error.message });
  }

  return json(200, {
    slug, title, html_len: html.length,
    url: `https://eventvendora.com/s/${slug}`,
    cached,
    ...(save ? {} : { html }),
  });
}
