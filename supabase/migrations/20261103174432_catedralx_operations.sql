-- Reconstructed from the applied production catalog because the source migration
-- was absent from the repository. This version is already recorded in Supabase.
CREATE TABLE IF NOT EXISTS public.catedralx_operations (
  operation_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_sha256 text NOT NULL CHECK (prompt_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','submitting','queued','running','executing','candidate',
      'awaiting_acceptance','accepted','blocked','failed','reconciliation_required','refunded')),
  credits_state text NOT NULL DEFAULT 'not_debited'
    CHECK (credits_state IN ('not_debited','reserved','consumed','refunded')),
  run_id text UNIQUE,
  task_id text UNIQUE,
  trace_id text CHECK (trace_id IS NULL OR trace_id ~ '^[0-9a-f]{32}$'),
  result_id text,
  result_payload jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS catedralx_operations_user_created_idx
  ON public.catedralx_operations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS catedralx_operations_status_updated_idx
  ON public.catedralx_operations (status, updated_at);
ALTER TABLE public.catedralx_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.catedralx_operations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.catedralx_operations TO service_role;
COMMENT ON TABLE public.catedralx_operations IS
  'Server-only correlation ledger for MAGIS tasks executed by the independently governed CatedralX engine.';
