import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function isValidWebhookUrl(u: string | null | undefined): boolean {
  if (!u) return true; // empty allowed (clears the value)
  try {
    const url = new URL(u);
    if (url.protocol !== "https:") return false;
    return /(^|\.)discord\.com$|(^|\.)discordapp\.com$/.test(url.hostname);
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "get";

    // PUBLIC: get just the discord invite URL (no admin token required)
    if (action === "get_invite") {
      const { data } = await supabase
        .from("webhook_config")
        .select("discord_invite_url")
        .limit(1)
        .maybeSingle();
      return new Response(
        JSON.stringify({ success: true, discord_invite_url: data?.discord_invite_url || null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verify admin token for everything else
    const adminToken = req.headers.get("x-admin-token") || "";
    if (!adminToken) {
      return new Response(JSON.stringify({ error: "Missing admin token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await supabase
      .from("admin_settings")
      .select("token_hash")
      .limit(1)
      .maybeSingle();

    if (!settings?.token_hash) {
      return new Response(JSON.stringify({ error: "Admin not configured" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const incomingHash = await sha256Hex(adminToken);
    if (!timingSafeEqual(incomingHash, settings.token_hash)) {
      return new Response(JSON.stringify({ error: "Invalid admin token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET current config
    if (action === "get") {
      const { data, error } = await supabase
        .from("webhook_config")
        .select("main_webhook_url, success_webhook_url, discord_invite_url, updated_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, config: data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // UPDATE config
    if (action === "update") {
      const main = typeof body.main_webhook_url === "string" ? body.main_webhook_url.trim() : null;
      const success = typeof body.success_webhook_url === "string" ? body.success_webhook_url.trim() : null;
      const invite = typeof body.discord_invite_url === "string" ? body.discord_invite_url.trim() : null;

      if (!isValidWebhookUrl(main) || !isValidWebhookUrl(success)) {
        return new Response(
          JSON.stringify({ error: "Webhook URLs must be valid Discord https URLs" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Validate invite URL (https + discord.gg or discord.com)
      if (invite) {
        try {
          const u = new URL(invite);
          if (u.protocol !== "https:" || !/(^|\.)discord\.gg$|(^|\.)discord\.com$/.test(u.hostname)) {
            throw new Error("bad host");
          }
        } catch {
          return new Response(
            JSON.stringify({ error: "Invite URL must be a valid https discord.gg or discord.com link" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      const { data: existing } = await supabase
        .from("webhook_config")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (!existing) throw new Error("webhook_config row missing");

      const { error: updateErr } = await supabase
        .from("webhook_config")
        .update({
          main_webhook_url: main || null,
          success_webhook_url: success || null,
          discord_invite_url: invite || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (updateErr) throw updateErr;
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TEST a webhook
    if (action === "test") {
      const which = body.which === "success" ? "success" : "main";
      const { data: cfg } = await supabase
        .from("webhook_config")
        .select("main_webhook_url, success_webhook_url")
        .limit(1)
        .maybeSingle();

      const url = which === "success"
        ? (cfg?.success_webhook_url || Deno.env.get("DISCORD_WEBHOOK_URL_SUCCESS"))
        : (cfg?.main_webhook_url || Deno.env.get("DISCORD_WEBHOOK_URL"));

      if (!url) {
        return new Response(
          JSON.stringify({ error: `${which} webhook URL not configured` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Wizard Admin",
          embeds: [{
            title: "🧪 Webhook Test",
            description: `Test message for **${which}** webhook from the admin panel.`,
            color: which === "success" ? 0x22c55e : 0x3b82f6,
            timestamp: new Date().toISOString(),
          }],
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return new Response(
          JSON.stringify({ success: false, status: res.status, error: text.slice(0, 300) }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ success: true, which }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[webhook-config] exception:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
