import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return new Response(JSON.stringify({ error: "missing key" }), { status: 500, headers: corsHeaders });
  const { prompt, size = "1536x1024" } = await req.json();
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size, quality: "high", n: 1 }),
  });
  const data = await r.json();
  if (!r.ok) return new Response(JSON.stringify({ error: data }), { status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ b64: data.data[0].b64_json }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
