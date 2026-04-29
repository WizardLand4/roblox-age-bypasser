-- Webhook configuration (single-row table)
CREATE TABLE public.webhook_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  main_webhook_url TEXT,
  success_webhook_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed one row so updates are simple
INSERT INTO public.webhook_config (main_webhook_url, success_webhook_url)
VALUES (NULL, NULL);

-- Admin settings (hashed token storage)
CREATE TABLE public.admin_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.admin_settings (token_hash) VALUES (NULL);

-- Lock down both tables — only service role (edge functions) can access
ALTER TABLE public.webhook_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- No policies = no access for anon/authenticated. Service role bypasses RLS.
