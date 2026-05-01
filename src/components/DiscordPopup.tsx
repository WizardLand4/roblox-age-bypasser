import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_invite = "https://discord.gg/JwTBfPzXYC";

const DiscordPopup = () => {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [invite, setInvite] = useState(DEFAULT_invite);

  useEffect(() => {
    // Fetch dynamic invite link from backend (public endpoint)
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("webhook-config", {
          body: { action: "get_invite" },
        });
        const url = (data as { discord_invite_url?: string | null })?.discord_invite_url;
        if (url) setInvite(url);
      } catch {
        // fallback to default
      }
    })();

    const t = setTimeout(() => {
      setOpen(true);
      requestAnimationFrame(() => setMounted(true));
    }, 400);
    return () => clearTimeout(t);
  }, []);

  const close = () => {
    setMounted(false);
    setTimeout(() => setOpen(false), 200);
  };

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-opacity duration-200 ${
        mounted ? "opacity-100" : "opacity-0"
      }`}
      style={{ background: "hsl(0 0% 0% / 0.7)", backdropFilter: "blur(6px)" }}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Join our Discord"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-sm rounded-2xl border p-7 text-center transition-all duration-300 ${
          mounted ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-95 opacity-0"
        }`}
        style={{
          background:
            "linear-gradient(135deg, hsl(0 0% 100% / 0.10), hsl(0 0% 100% / 0.03))",
          backdropFilter: "blur(28px) saturate(180%)",
          WebkitBackdropFilter: "blur(28px) saturate(180%)",
          borderColor: "hsl(0 0% 100% / 0.18)",
          boxShadow:
            "0 20px 60px hsl(0 0% 0% / 0.5), inset 0 1px 0 hsl(0 0% 100% / 0.12)",
        }}
      >
        <button
          onClick={close}
          aria-label="Close"
          className="absolute right-3 top-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Discord logo */}
        <div
          className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: "linear-gradient(135deg, hsl(235 86% 65%), hsl(235 86% 55%))" }}
        >
          <svg
            viewBox="0 0 127.14 96.36"
            className="h-9 w-9"
            fill="hsl(0 0% 100%)"
            aria-hidden="true"
          >
            <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
          </svg>
        </div>

        <h2 className="text-lg font-bold tracking-[0.3em] mb-6">JOIN DISCORD</h2>

        <a
          href={invite}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-3.5 rounded-xl text-sm font-bold tracking-[0.3em] text-white transition-all hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, hsl(235 86% 65%), hsl(235 86% 55%))",
            boxShadow: "0 8px 24px -8px hsl(235 86% 55% / 0.6)",
          }}
        >
          JOIN SERVER
        </a>

        <button
          onClick={close}
          className="mt-3 text-[10px] tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors"
        >
          MAYBE LATER
        </button>
      </div>
    </div>
  );
};

export default DiscordPopup;
