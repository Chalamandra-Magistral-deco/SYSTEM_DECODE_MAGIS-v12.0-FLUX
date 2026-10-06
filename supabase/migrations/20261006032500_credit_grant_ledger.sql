-- MAGIS // CREDIT GRANT LEDGER
-- Every commercial account creation receives a traceable initial credit grant.

CREATE OR REPLACE FUNCTION private.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan_id uuid;
  v_credits integer;
BEGIN
  SELECT id, credits
  INTO v_plan_id, v_credits
  FROM public.plans
  WHERE code = 'free'
    AND active = true
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'MAGIS_FREE_PLAN_NOT_AVAILABLE';
  END IF;

  INSERT INTO public.profiles (id)
  VALUES (NEW.id);

  INSERT INTO public.user_plans (
    user_id,
    plan_id,
    status
  )
  VALUES (
    NEW.id,
    v_plan_id,
    'active'
  );

  INSERT INTO public.credit_accounts (
    user_id,
    balance
  )
  VALUES (
    NEW.id,
    v_credits
  );

  INSERT INTO public.credit_ledger (
    user_id,
    delta,
    reason,
    reference_id,
    metadata
  )
  VALUES (
    NEW.id,
    v_credits,
    'signup_grant',
    'auth_signup:' || NEW.id::text,
    jsonb_build_object(
      'plan_code', 'free',
      'initial_grant', true
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION private.handle_new_auth_user()
FROM PUBLIC, anon, authenticated;

-- Backfill the existing test account created before ledger tracking existed.
INSERT INTO public.credit_ledger (
  user_id,
  delta,
  reason,
  reference_id,
  metadata
)
SELECT
  ca.user_id,
  ca.balance,
  'signup_grant',
  'auth_signup:' || ca.user_id::text,
  jsonb_build_object(
    'plan_code', 'free',
    'initial_grant', true,
    'backfilled', true
  )
FROM public.credit_accounts ca
JOIN public.user_plans up
  ON up.user_id = ca.user_id
JOIN public.plans pl
  ON pl.id = up.plan_id
WHERE pl.code = 'free'
  AND NOT EXISTS (
    SELECT 1
    FROM public.credit_ledger cl
    WHERE cl.user_id = ca.user_id
      AND cl.reason = 'signup_grant'
  );
