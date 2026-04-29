import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
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
    const action = typeof body.action === "string" ? body.action : "verify";
    const token = typeof body.token === "string" ? body.token : "";

    if (!token || token.length < 8 || token.length > 256) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const incomingHash = await sha256Hex(token);

    // Fetch current admin settings row
    const { data: row, error: fetchErr } = await supabase
      .from("admin_settings")
      .select("id, token_hash")
      .limit(1)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!row) {
      return new Response(
        JSON.stringify({ success: false, error: "Admin settings not initialized" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // SETUP: first-time token — only allowed if no token has been set yet
    if (action === "setup") {
      if (row.token_hash) {
        return new Response(
          JSON.stringify({ success: false, error: "Admin token already set" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { error: updateErr } = await supabase
        .from("admin_settings")
        .update({ token_hash: incomingHash, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (updateErr) throw updateErr;
      return new Response(
        JSON.stringify({ success: true, action: "setup" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // VERIFY: standard login check
    if (!row.token_hash) {
      return new Response(
        JSON.stringify({ success: false, error: "Admin token not configured. Use setup first.", needsSetup: true }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ok = timingSafeEqual(incomingHash, row.token_hash);
    if (!ok) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, action: "verify" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[admin-auth] exception:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
