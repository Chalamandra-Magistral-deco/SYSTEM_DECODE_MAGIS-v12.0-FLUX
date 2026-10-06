CREATE OR REPLACE FUNCTION public.refund_execution_credits(
  p_user_id uuid,
  p_operation_id text,
  p_reason text DEFAULT 'execution_failed'
)
RETURNS TABLE(
  allowed boolean,
  status text,
  balance integer,
  credits_refunded integer,
  replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_balance integer;
  v_debit integer;
  v_refund_reference text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN QUERY
    SELECT false, 'invalid_user_id', 0, 0, false;
    RETURN;
  END IF;

  IF p_operation_id IS NULL OR btrim(p_operation_id) = '' THEN
    RETURN QUERY
    SELECT false, 'invalid_operation_id', 0, 0, false;
    RETURN;
  END IF;

  v_refund_reference := p_operation_id || ':refund';

  SELECT -cl.delta
  INTO v_debit
  FROM public.credit_ledger AS cl
  WHERE cl.user_id = p_user_id
    AND cl.reason = 'execution_debit'
    AND cl.reference_id = p_operation_id
    AND cl.delta < 0
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT false, 'execution_debit_not_found', 0, 0, false;
    RETURN;
  END IF;

  SELECT ca.balance
  INTO v_balance
  FROM public.credit_accounts AS ca
  WHERE ca.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT false, 'credit_account_not_found', 0, 0, false;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.credit_ledger AS cl
    WHERE cl.user_id = p_user_id
      AND cl.reason = 'execution_refund'
      AND cl.reference_id = v_refund_reference
  ) THEN
    RETURN QUERY
    SELECT true, 'replayed', v_balance, v_debit, true;
    RETURN;
  END IF;

  UPDATE public.credit_accounts AS ca
  SET balance = ca.balance + v_debit
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
    v_debit,
    'execution_refund',
    v_refund_reference,
    jsonb_build_object(
      'operation_id', p_operation_id,
      'reason', p_reason,
      'credits_refunded', v_debit
    )
  );

  RETURN QUERY
  SELECT true, 'refunded', v_balance, v_debit, false;
END;
$$;

REVOKE ALL
ON FUNCTION public.refund_execution_credits(uuid, text, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.refund_execution_credits(uuid, text, text)
TO service_role;
