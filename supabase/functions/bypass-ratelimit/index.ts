import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DAILY_LIMIT = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const fwd = req.headers.get("x-forwarded-for") || "";
    const ip = (fwd.split(",")[0] || req.headers.get("cf-connecting-ip") || "unknown").trim();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count, error: countErr } = await supabase
      .from("bypass_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", since);

    if (countErr) throw countErr;

    const used = count ?? 0;
    if (used >= DAILY_LIMIT) {
      return new Response(
        JSON.stringify({ allowed: false, used, limit: DAILY_LIMIT, remaining: 0 }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: insErr } = await supabase.from("bypass_attempts").insert({ ip });
    if (insErr) throw insErr;

    return new Response(
      JSON.stringify({ allowed: true, used: used + 1, limit: DAILY_LIMIT, remaining: DAILY_LIMIT - used - 1 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[bypass-ratelimit]", msg);
    return new Response(JSON.stringify({ allowed: true, error: msg }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
