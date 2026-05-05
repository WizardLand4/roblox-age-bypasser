
CREATE TABLE public.bypass_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bypass_attempts_ip_created_idx ON public.bypass_attempts (ip, created_at DESC);
ALTER TABLE public.bypass_attempts ENABLE ROW LEVEL SECURITY;
