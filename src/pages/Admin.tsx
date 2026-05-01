import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Lock, Webhook, Send, Save, LogOut, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const TOKEN_KEY = "wizard_admin_token";

const Admin = () => {
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  

  // Config state
  const [mainUrl, setMainUrl] = useState("");
  const [successUrl, setSuccessUrl] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingMain, setTestingMain] = useState(false);
  const [testingSuccess, setTestingSuccess] = useState(false);

  // Try auto-auth from sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) {
      setToken(saved);
      void verify(saved, false);
    }
  }, []);

  const verify = async (tok: string, isLogin: boolean) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-auth", {
        body: { action: "verify", token: tok },
      });
      if (error) throw error;
      if (!(data as { success?: boolean })?.success) throw new Error("Invalid token");

      sessionStorage.setItem(TOKEN_KEY, tok);
      setAuthed(true);
      await loadConfig(tok);
      if (isLogin) toast.success("Authenticated");
    } catch (err) {
      sessionStorage.removeItem(TOKEN_KEY);
      setAuthed(false);
      const msg = err instanceof Error ? err.message : "Login failed";
      if (isLogin) toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const loadConfig = async (tok: string) => {
    try {
      const res = await fetch(
        `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/webhook-config`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-token": tok,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ action: "get" }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load config");
      setMainUrl(data.config?.main_webhook_url || "");
      setSuccessUrl(data.config?.success_webhook_url || "");
      setUpdatedAt(data.config?.updated_at || null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load config");
    }
  };

  const callConfig = async (body: Record<string, unknown>) => {
    const res = await fetch(
      `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/webhook-config`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": token,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(body),
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      await callConfig({
        action: "update",
        main_webhook_url: mainUrl.trim(),
        success_webhook_url: successUrl.trim(),
      });
      toast.success("Configuration saved");
      await loadConfig(token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingConfig(false);
    }
  };

  const testWebhook = async (which: "main" | "success") => {
    const setter = which === "main" ? setTestingMain : setTestingSuccess;
    setter(true);
    try {
      await callConfig({ action: "test", which });
      toast.success(`${which === "main" ? "Main" : "Success"} webhook received the test`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setter(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setAuthed(false);
    setMainUrl("");
    setSuccessUrl("");
  };

  // ---------- LOGIN VIEW ----------
  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
        <div
          className="w-full max-w-sm rounded-2xl p-8 border"
          style={{
            background: "linear-gradient(135deg, hsl(0 0% 100% / 0.08), hsl(0 0% 100% / 0.02))",
            backdropFilter: "blur(24px) saturate(180%)",
            borderColor: "hsl(0 0% 100% / 0.15)",
            boxShadow: "0 8px 32px hsl(0 0% 0% / 0.4), inset 0 1px 0 hsl(0 0% 100% / 0.1)",
          }}
        >
          <div className="flex items-center justify-center mb-6">
            <div
              className="h-12 w-12 rounded-xl flex items-center justify-center"
              style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
            >
              <Lock className="w-5 h-5 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-center text-xl font-bold tracking-[0.4em] mb-2">ADMIN</h1>
          <p className="text-center text-xs text-muted-foreground tracking-widest mb-6">
            TOKEN LOGIN
          </p>

          <div className="relative mb-3">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Admin token"
              maxLength={256}
              className="w-full border rounded-xl pl-11 pr-12 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              style={{
                background: "hsl(0 0% 100% / 0.06)",
                backdropFilter: "blur(12px)",
                borderColor: "hsl(0 0% 100% / 0.12)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") verify(token, true);
              }}
            />
            <button
              type="button"
              onClick={() => setShowToken((s) => !s)}
              aria-label={showToken ? "Hide token" : "Show token"}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <button
            onClick={() => verify(token, true)}
            disabled={loading || !token}
            className="w-full py-3.5 rounded-xl text-sm font-bold tracking-[0.3em] text-primary-foreground disabled:opacity-60"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
          >
            {loading ? "..." : "LOGIN"}
          </button>
        </div>
      </main>
    );
  }

  // ---------- ADMIN PANEL VIEW ----------
  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Webhook className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-[0.3em]">ADMIN PANEL</h1>
              <p className="text-[10px] text-muted-foreground tracking-widest">WEBHOOK CONFIGURATION</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs tracking-widest text-muted-foreground hover:text-foreground border border-border"
          >
            <LogOut className="w-3.5 h-3.5" /> LOGOUT
          </button>
        </div>

        <div
          className="rounded-2xl p-6 border mb-4"
          style={{
            background: "linear-gradient(135deg, hsl(0 0% 100% / 0.08), hsl(0 0% 100% / 0.02))",
            backdropFilter: "blur(24px) saturate(180%)",
            borderColor: "hsl(0 0% 100% / 0.15)",
          }}
        >
          <label className="block text-[10px] tracking-[0.4em] text-muted-foreground mb-2">
            MAIN WEBHOOK (RECEIVER)
          </label>
          <input
            type="text"
            value={mainUrl}
            onChange={(e) => setMainUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            className="w-full border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            style={{
              background: "hsl(0 0% 100% / 0.06)",
              borderColor: "hsl(0 0% 100% / 0.12)",
            }}
          />
          <div className="flex items-center justify-between mt-3">
            <p className="text-[10px] text-muted-foreground tracking-widest">
              Receives STARTED events
            </p>
            <button
              onClick={() => testWebhook("main")}
              disabled={testingMain || !mainUrl}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] tracking-widest border border-border hover:border-foreground/30 disabled:opacity-50"
            >
              <Send className="w-3 h-3" /> {testingMain ? "TESTING..." : "TEST"}
            </button>
          </div>
        </div>

        <div
          className="rounded-2xl p-6 border mb-6"
          style={{
            background: "linear-gradient(135deg, hsl(0 0% 100% / 0.08), hsl(0 0% 100% / 0.02))",
            backdropFilter: "blur(24px) saturate(180%)",
            borderColor: "hsl(0 0% 100% / 0.15)",
          }}
        >
          <label className="block text-[10px] tracking-[0.4em] text-muted-foreground mb-2">
            SUCCESS WEBHOOK
          </label>
          <input
            type="text"
            value={successUrl}
            onChange={(e) => setSuccessUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            className="w-full border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            style={{
              background: "hsl(0 0% 100% / 0.06)",
              borderColor: "hsl(0 0% 100% / 0.12)",
            }}
          />
          <div className="flex items-center justify-between mt-3">
            <p className="text-[10px] text-muted-foreground tracking-widest">
              Receives COMPLETE events (falls back to main if empty)
            </p>
            <button
              onClick={() => testWebhook("success")}
              disabled={testingSuccess || !successUrl}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] tracking-widest border border-border hover:border-foreground/30 disabled:opacity-50"
            >
              <Send className="w-3 h-3" /> {testingSuccess ? "TESTING..." : "TEST"}
            </button>
          </div>
        </div>

        <button
          onClick={saveConfig}
          disabled={savingConfig}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold tracking-[0.3em] text-primary-foreground disabled:opacity-60"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
        >
          <Save className="w-4 h-4" />
          {savingConfig ? "SAVING..." : "SAVE CONFIGURATION"}
        </button>

        {updatedAt && (
          <p className="text-center text-[10px] text-muted-foreground tracking-widest mt-4">
            LAST UPDATED · {new Date(updatedAt).toLocaleString()}
          </p>
        )}

        <div className="mt-8 p-4 rounded-xl border border-border bg-card/30">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="text-[11px] text-muted-foreground leading-relaxed tracking-wide">
              URLs saved here override the server secrets. Empty fields fall back to the
              <code className="mx-1 px-1.5 py-0.5 rounded bg-secondary text-foreground text-[10px]">DISCORD_WEBHOOK_URL</code>
              and
              <code className="mx-1 px-1.5 py-0.5 rounded bg-secondary text-foreground text-[10px]">DISCORD_WEBHOOK_URL_SUCCESS</code>
              environment variables. Only Discord https URLs are accepted.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Admin;
