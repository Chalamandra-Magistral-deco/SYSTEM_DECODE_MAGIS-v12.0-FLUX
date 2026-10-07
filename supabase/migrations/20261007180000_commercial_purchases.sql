-- MAGIS // COMMERCIAL PURCHASES
-- One-time Stripe credit packs with server-side, idempotent fulfillment.

CREATE TABLE IF NOT EXISTS public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'stripe'
    CHECK (provider = 'stripe'),
  provider_session_id text NOT NULL UNIQUE,
  provider_event_id text UNIQUE,
  provider_payment_id text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  credits integer NOT NULL CHECK (credits > 0),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL CHECK (char_length(currency) = 3),
  status text NOT NULL DEFAULT 'paid'
    CHECK (status IN ('paid', 'refunded', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS purchases_user_created_idx
  ON public.purchases(user_id, created_at DESC);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON TABLE public.purchases
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.grant_purchase_credits(
  p_user_id uuid,
  p_plan_code text,
  p_provider_session_id text,
  p_provider_event_id text,
  p_provider_payment_id text DEFAULT NULL,
  p_amount_cents integer DEFAULT NULL,
  p_currency text DEFAULT NULL
)
RETURNS TABLE(
  granted boolean,
  status text,
  balance integer,
  credits_granted integer,
  replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan public.plans%ROWTYPE;
  v_purchase public.purchases%ROWTYPE;
  v_balance integer;
  v_reference text;
BEGIN
  IF p_user_id IS NULL
     OR p_plan_code IS NULL
     OR btrim(p_plan_code) = ''
     OR p_provider_session_id IS NULL
     OR btrim(p_provider_session_id) = ''
     OR p_provider_event_id IS NULL
     OR btrim(p_provider_event_id) = '' THEN
    RAISE EXCEPTION 'INVALID_PURCHASE_REFERENCE';
  END IF;

  SELECT *
  INTO v_plan
  FROM public.plans
  WHERE code = p_plan_code
    AND active = true
    AND price_cents > 0
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAID_PLAN_NOT_FOUND';
  END IF;

  IF p_amount_cents IS DISTINCT FROM v_plan.price_cents
     OR lower(coalesce(p_currency, '')) <> lower(v_plan.currency) THEN
    RAISE EXCEPTION 'PURCHASE_AMOUNT_MISMATCH';
  END IF;

  SELECT *
  INTO v_purchase
  FROM public.purchases
  WHERE provider_session_id = p_provider_session_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_purchase.user_id <> p_user_id
       OR v_purchase.plan_id <> v_plan.id
       OR v_purchase.amount_cents <> v_plan.price_cents
       OR lower(v_purchase.currency) <> lower(v_plan.currency) THEN
      RAISE EXCEPTION 'PURCHASE_IDENTITY_MISMATCH';
    END IF;

    SELECT ca.balance
    INTO v_balance
    FROM public.credit_accounts AS ca
    WHERE ca.user_id = p_user_id;

    RETURN QUERY
    SELECT true, 'replayed', coalesce(v_balance, 0), v_purchase.credits, true;
    RETURN;
  END IF;

  SELECT ca.balance
  INTO v_balance
  FROM public.credit_accounts AS ca
  WHERE ca.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CREDIT_ACCOUNT_NOT_FOUND';
  END IF;

  v_reference := 'stripe_checkout:' || p_provider_session_id;

  INSERT INTO public.purchases (
    provider,
    provider_session_id,
    provider_event_id,
    provider_payment_id,
    user_id,
    plan_id,
    credits,
    amount_cents,
    currency,
    status,
    metadata
  )
  VALUES (
    'stripe',
    p_provider_session_id,
    p_provider_event_id,
    p_provider_payment_id,
    p_user_id,
    v_plan.id,
    v_plan.credits,
    v_plan.price_cents,
    v_plan.currency,
    'paid',
    jsonb_build_object(
      'plan_code', v_plan.code,
      'source', 'stripe_checkout'
    )
  );

  UPDATE public.credit_accounts AS ca
  SET balance = ca.balance + v_plan.credits
  WHERE ca.user_id = p_user_id
  RETURNING ca.balance
  INTO v_balance;

  INSERT INTO public.credit_ledger (
    user_id,
    delta,
    reason,
    reference_id,
    metadata
  )
  VALUES (
    p_user_id,
    v_plan.credits,
    'purchase_grant',
    v_reference,
    jsonb_build_object(
      'provider', 'stripe',
      'provider_session_id', p_provider_session_id,
      'provider_event_id', p_provider_event_id,
      'plan_code', v_plan.code,
      'amount_cents', v_plan.price_cents,
      'currency', v_plan.currency,
      'credits_granted', v_plan.credits
    )
  );

  RETURN QUERY
  SELECT true, 'granted', v_balance, v_plan.credits, false;
END;
$$;

REVOKE ALL
ON FUNCTION public.grant_purchase_credits(
  uuid, text, text, text, text, integer, text
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.grant_purchase_credits(
  uuid, text, text, text, text, integer, text
)
TO service_role;
