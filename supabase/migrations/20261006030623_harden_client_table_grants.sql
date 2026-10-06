-- MAGIS: least-privilege grants for exposed public tables.
-- Client roles receive only the reads required by the current product flow.
-- Server-side/service roles retain system write capabilities.

REVOKE ALL ON TABLE
  public.plans,
  public.profiles,
  public.user_plans,
  public.credit_accounts,
  public.credit_ledger
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.plans,
  public.profiles,
  public.user_plans,
  public.credit_accounts,
  public.credit_ledger
TO authenticated;
