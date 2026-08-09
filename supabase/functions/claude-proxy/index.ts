// Supabase Edge Function — Claude proxy
// --------------------------------------
// Hides the Anthropic API key on the server so it never reaches the browser.
// The browser POSTs the same body it would have sent to api.anthropic.com,
// this function adds the key and forwards. Only authenticated users can call
// it (Supabase enforces JWT verification on Edge Functions by default).
//
// Deploy:
//   1. Install the Supabase CLI: https://supabase.com/docs/guides/cli
//   2. supabase login
//   3. supabase link --project-ref <your-project-ref>
//   4. supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   5. supabase functions deploy claude-proxy
//
// Then set VITE_CLAUDE_PROXY_URL in the frontend .env (production build):
//   VITE_CLAUDE_PROXY_URL=https://<project-ref>.functions.supabase.co/claude-proxy
//
// And REMOVE VITE_ANTHROPIC_KEY from any deployed environment.

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  // Add your production origin(s) here, e.g.
  // "https://lendaro.com.au",
];

const corsHeaders = (origin: string | null) => {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders(origin) });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY secret is not set on this function." }),
      { status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
    );
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // Hard-cap max_tokens so a malicious caller can't run up the bill.
  const safeBody = {
    model: typeof payload.model === "string" ? payload.model : "claude-haiku-4-5-20251001",
    max_tokens: Math.min(Number(payload.max_tokens) || 1000, 2000),
    system: typeof payload.system === "string" ? payload.system : undefined,
    messages: Array.isArray(payload.messages) ? payload.messages : [],
  };

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(safeBody),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
});
