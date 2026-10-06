-- MAGIS: bootstrap commercial state when Supabase Auth creates a user.
-- The function is kept outside exposed schemas and is not callable
-- by client roles.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;

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

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION private.handle_new_auth_user()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION private.handle_new_auth_user();
