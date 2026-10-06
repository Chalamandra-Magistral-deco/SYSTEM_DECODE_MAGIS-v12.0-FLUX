-- MAGIS // ATOMIC CREDIT CONSUMPTION

CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_user_reference_uidx
ON public.credit_ledger (user_id, reference_id)
WHERE reference_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.consume_credits(
  p_user_id uuid,
  p_operation_id text,
  p_capability text,
  p_credits_required integer
)
RETURNS TABLE (
  allowed boolean,
  status text,
  balance integer,
  credits_consumed integer,
  replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_balance integer;
  v_existing_delta integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR (SELECT auth.uid()) <> p_user_id THEN
    RETURN QUERY SELECT false, 'unauthorized', 0, 0, false;
    RETURN;
  END IF;

  IF p_credits_required IS NULL OR p_credits_required <= 0 THEN
    RETURN QUERY SELECT false, 'invalid_credits_required', 0, 0, false;
    RETURN;
  END IF;

  IF p_operation_id IS NULL OR btrim(p_operation_id) = '' THEN
    RETURN QUERY SELECT false, 'invalid_operation_id', 0, 0, false;
    RETURN;
  END IF;

  SELECT ca.balance
  INTO v_balance
  FROM public.credit_accounts AS ca
  WHERE ca.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'credit_account_not_found', 0, 0, false;
    RETURN;
  END IF;

  SELECT cl.delta
  INTO v_existing_delta
  FROM public.credit_ledger AS cl
  WHERE cl.user_id = p_user_id
    AND cl.reason = 'execution_debit'
    AND cl.reference_id = p_operation_id
  LIMIT 1;

  IF FOUND THEN
    IF v_existing_delta <> -p_credits_required THEN
      RAISE EXCEPTION 'OPERATION_CREDIT_MISMATCH';
    END IF;

    RETURN QUERY
    SELECT true, 'replayed', v_balance, p_credits_required, true;
    RETURN;
  END IF;

  IF v_balance < p_credits_required THEN
    RETURN QUERY
    SELECT false, 'insufficient_credits', v_balance, 0, false;
    RETURN;
  END IF;

  UPDATE public.credit_accounts
  SET balance = balance - p_credits_required
  WHERE user_id = p_user_id
  RETURNING credit_accounts.balance
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
    -p_credits_required,
    'execution_debit',
    p_operation_id,
    jsonb_build_object(
      'capability', p_capability,
      'credits_required', p_credits_required
    )
  );

  RETURN QUERY
  SELECT true, 'consumed', v_balance, p_credits_required, false;
END;
$$;

REVOKE ALL
ON FUNCTION public.consume_credits(uuid, text, text, integer)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.consume_credits(uuid, text, text, integer)
TO authenticated;
