const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: "DISCORD_WEBHOOK_URL not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const version = body.version === "v2" ? "V2" : "V1";
    const status = typeof body.status === "string" ? body.status.slice(0, 100) : "COMPLETE";
    const timestamp = new Date().toISOString();

    const color = status === "COMPLETE" ? 0x3b82f6 : 0xef4444;

    const payload = {
      username: "Wizard Bypass",
      embeds: [
        {
          title: `🪄 Bypass ${status}`,
          color,
          fields: [
            { name: "Version", value: version, inline: true },
            { name: "Status", value: status, inline: true },
            { name: "Timestamp", value: timestamp, inline: false },
          ],
          timestamp,
        },
      ],
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(
        JSON.stringify({ error: `Discord error [${res.status}]: ${text}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
