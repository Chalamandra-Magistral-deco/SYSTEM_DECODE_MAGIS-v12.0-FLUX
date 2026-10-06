-- MAGIS: profiles is system-managed.
-- Client roles may read their own profile, but may not create,
-- update, or delete profile records or change profile status.

REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;

GRANT SELECT ON TABLE public.profiles TO authenticated;

DROP POLICY IF EXISTS users_can_crud_own_profile ON public.profiles;
DROP POLICY IF EXISTS users_can_insert_own_profile ON public.profiles;
DROP POLICY IF EXISTS users_can_update_own_profile ON public.profiles;
DROP POLICY IF EXISTS users_can_delete_own_profile ON public.profiles;
DROP POLICY IF EXISTS users_can_read_own_profile ON public.profiles;

CREATE POLICY users_can_read_own_profile
ON public.profiles
FOR SELECT
TO authenticated
USING (
  (SELECT auth.uid()) = id
);
