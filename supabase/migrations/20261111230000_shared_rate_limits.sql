-- Shared atomic rate limits for Vercel serverless instances.
-- Bucket identifiers are SHA-256 hashes; raw IP addresses and user IDs are not stored.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE TABLE IF NOT EXISTS private.rate_limit_buckets (
  bucket_key text PRIMARY KEY CHECK (bucket_key ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0)
);
ALTER TABLE private.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.rate_limit_buckets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.rate_limit_buckets TO service_role;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_bucket_key text, p_limit integer, p_window_seconds integer
)
RETURNS TABLE (allowed boolean, retry_after_seconds integer, remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_started_at timestamptz;
  v_count integer;
  v_retry integer;
BEGIN
  IF p_bucket_key IS NULL OR p_bucket_key !~ '^[0-9a-f]{64}$'
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 10000
     OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate limit parameters' USING ERRCODE = '22023';
  END IF;

  INSERT INTO private.rate_limit_buckets AS current_bucket
    (bucket_key, window_started_at, request_count)
  VALUES (p_bucket_key, v_now, 1)
  ON CONFLICT (bucket_key) DO UPDATE SET
    window_started_at = CASE
      WHEN current_bucket.window_started_at <= v_now - make_interval(secs => p_window_seconds)
      THEN v_now ELSE current_bucket.window_started_at END,
    request_count = CASE
      WHEN current_bucket.window_started_at <= v_now - make_interval(secs => p_window_seconds)
      THEN 1 ELSE current_bucket.request_count + 1 END
  RETURNING current_bucket.request_count, current_bucket.window_started_at
  INTO v_count, v_started_at;

  -- Opportunistic cleanup avoids a paid cache or a scheduled job.
  IF random() < 0.01 THEN
    DELETE FROM private.rate_limit_buckets
    WHERE window_started_at < v_now - interval '1 day';
  END IF;

  v_retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (
    v_started_at + make_interval(secs => p_window_seconds) - v_now
  )))::integer);

  RETURN QUERY SELECT v_count <= p_limit,
    CASE WHEN v_count <= p_limit THEN 0 ELSE v_retry END,
    GREATEST(0, p_limit - v_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer)
  TO service_role;
