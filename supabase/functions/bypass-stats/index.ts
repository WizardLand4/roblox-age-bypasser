const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const res = await fetch("https://rblxbypasser.com/api/stats", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const data = await res.json().catch(() => ({}));
    const total = typeof data?.total === "number" ? data.total : null;
    return new Response(JSON.stringify({ success: true, total }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg, total: null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
