-- MAGIS // UNIFIED COMMERCIAL SALES ENGINE v1
-- Durable Stripe receipt ledger + fulfillment/review outbox.
-- This migration is additive: it does not mutate production data by itself.

CREATE TABLE IF NOT EXISTS public.commercial_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL UNIQUE
    CHECK (product_code ~ '^[a-z0-9_-]{2,80}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) > 0),
  stripe_payment_link_id text UNIQUE,
  expected_amount_cents integer NOT NULL CHECK (expected_amount_cents > 0),
  currency text NOT NULL
    CHECK (char_length(currency) = 3 AND currency = upper(currency)),
  fulfillment_mode text NOT NULL DEFAULT 'manual'
    CHECK (fulfillment_mode IN ('manual', 'credits', 'none')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.commercial_products IS
  'Private server-side catalog mapping product codes to Stripe Payment Links and expected gross prices.';

INSERT INTO public.commercial_products
  (product_code, name, stripe_payment_link_id, expected_amount_cents, currency, fulfillment_mode, active)
VALUES
  ('kit_magistral', 'Kit Magistral', 'plink_1UOgmbGkEniaqp9iQWWv3bK1', 39700, 'USD', 'manual', true),
  ('sesion_descubrimiento', 'Sesión Descubrimiento', 'plink_1UOgm9GkEniaqp9iMlOUyM9C', 2700, 'USD', 'manual', true),
  ('mapa_tricentrico', 'Mapa Tricéntrico', 'plink_1UO0nfGkEniaqp9iR579q8kq', 9900, 'MXN', 'manual', true)
ON CONFLICT (product_code) DO UPDATE
SET name = EXCLUDED.name,
    stripe_payment_link_id = EXCLUDED.stripe_payment_link_id,
    expected_amount_cents = EXCLUDED.expected_amount_cents,
    currency = EXCLUDED.currency,
    fulfillment_mode = EXCLUDED.fulfillment_mode,
    active = EXCLUDED.active,
    updated_at = now();

-- Credit plans are catalog products too, but their Checkout Sessions are created
-- by the server-side /api/checkout endpoint, not by a Payment Link.
INSERT INTO public.commercial_products
  (product_code, name, stripe_payment_link_id, expected_amount_cents, currency, fulfillment_mode, active)
SELECT
  'magis_' || p.code,
  p.name,
  NULL,
  p.price_cents,
  upper(p.currency),
  'credits',
  p.active
FROM public.plans AS p
WHERE p.code IN ('starter', 'pro')
  AND p.price_cents > 0
ON CONFLICT (product_code) DO UPDATE
SET name = EXCLUDED.name,
    expected_amount_cents = EXCLUDED.expected_amount_cents,
    currency = EXCLUDED.currency,
    fulfillment_mode = 'credits',
    active = EXCLUDED.active,
    updated_at = now();

CREATE TABLE IF NOT EXISTS public.sales_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'stripe' CHECK (provider = 'stripe'),
  provider_event_id text NOT NULL,
  provider_session_id text NOT NULL UNIQUE,
  provider_payment_intent_id text,
  provider_payment_link_id text,
  buyer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_email text,
  catalog_product_id uuid REFERENCES public.commercial_products(id) ON DELETE RESTRICT,
  product_code text,
  product_name_snapshot text NOT NULL,
  amount_subtotal_cents integer CHECK (amount_subtotal_cents IS NULL OR amount_subtotal_cents >= 0),
  amount_tax_cents integer NOT NULL DEFAULT 0 CHECK (amount_tax_cents >= 0),
  amount_discount_cents integer NOT NULL DEFAULT 0 CHECK (amount_discount_cents >= 0),
  amount_total_cents integer NOT NULL CHECK (amount_total_cents > 0),
  currency text NOT NULL CHECK (char_length(currency) = 3 AND currency = upper(currency)),
  payment_status text NOT NULL DEFAULT 'paid'
    CHECK (payment_status IN ('paid', 'partially_refunded', 'refunded', 'disputed')),
  fulfillment_status text NOT NULL
    CHECK (fulfillment_status IN ('completed', 'manual_required', 'review_required', 'processing', 'failed', 'cancelled')),
  review_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sales_receipts IS
  'Private, idempotent record of captured Stripe Checkout revenue. Amounts are gross minor units, not net proceeds.';

CREATE INDEX IF NOT EXISTS sales_receipts_created_idx
  ON public.sales_receipts(created_at DESC);
CREATE INDEX IF NOT EXISTS sales_receipts_product_created_idx
  ON public.sales_receipts(product_code, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_receipts_fulfillment_idx
  ON public.sales_receipts(fulfillment_status, created_at ASC);
CREATE INDEX IF NOT EXISTS sales_receipts_event_idx
  ON public.sales_receipts(provider_event_id);
CREATE INDEX IF NOT EXISTS sales_receipts_payment_intent_idx
  ON public.sales_receipts(provider_payment_intent_id)
  WHERE provider_payment_intent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sales_fulfillment_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_receipt_id uuid NOT NULL REFERENCES public.sales_receipts(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('commercial.manual_fulfillment_required', 'commercial.sale_review_required')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (sale_receipt_id, event_type)
);

COMMENT ON TABLE public.sales_fulfillment_outbox IS
  'Durable work queue created in the same database transaction as a sale receipt.';

CREATE INDEX IF NOT EXISTS sales_fulfillment_outbox_pending_idx
  ON public.sales_fulfillment_outbox(available_at, created_at)
  WHERE status IN ('pending', 'failed');

ALTER TABLE public.commercial_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_fulfillment_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.commercial_products FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sales_receipts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sales_fulfillment_outbox FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.commercial_products TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sales_receipts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sales_fulfillment_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.record_credit_sale_receipt(
  p_user_id uuid,
  p_plan_code text,
  p_provider_session_id text,
  p_provider_event_id text,
  p_provider_payment_id text,
  p_customer_email text,
  p_amount_total_cents integer,
  p_amount_subtotal_cents integer,
  p_amount_tax_cents integer,
  p_amount_discount_cents integer,
  p_currency text
)
RETURNS TABLE(receipt_id uuid, status text, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_purchase record;
  v_catalog_product_id uuid;
  v_receipt public.sales_receipts%ROWTYPE;
  v_receipt_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_plan_code IS NULL OR btrim(p_plan_code) = ''
     OR p_provider_session_id IS NULL OR btrim(p_provider_session_id) = ''
     OR p_provider_event_id IS NULL OR btrim(p_provider_event_id) = ''
     OR p_amount_total_cents IS NULL OR p_amount_total_cents <= 0
     OR p_currency IS NULL OR char_length(p_currency) <> 3 THEN
    RAISE EXCEPTION 'INVALID_SALE_RECEIPT_REFERENCE';
  END IF;

  SELECT pu.user_id, pu.amount_cents, pu.currency, pl.code, pl.name
  INTO v_purchase
  FROM public.purchases AS pu
  JOIN public.plans AS pl ON pl.id = pu.plan_id
  WHERE pu.provider_session_id = p_provider_session_id
    AND pu.status = 'paid'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CREDIT_PURCHASE_NOT_FOUND';
  END IF;

  IF v_purchase.user_id <> p_user_id
     OR v_purchase.code <> p_plan_code
     OR v_purchase.amount_cents <> p_amount_total_cents
     OR lower(v_purchase.currency) <> lower(p_currency) THEN
    RAISE EXCEPTION 'CREDIT_SALE_RECEIPT_MISMATCH';
  END IF;

  SELECT cp.id
  INTO v_catalog_product_id
  FROM public.commercial_products AS cp
  WHERE cp.product_code = 'magis_' || p_plan_code
  LIMIT 1;

  SELECT *
  INTO v_receipt
  FROM public.sales_receipts AS sr
  WHERE sr.provider_session_id = p_provider_session_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_receipt.buyer_user_id IS DISTINCT FROM p_user_id
       OR v_receipt.product_code IS DISTINCT FROM ('magis_' || p_plan_code)
       OR v_receipt.amount_total_cents <> p_amount_total_cents
       OR lower(v_receipt.currency) <> lower(p_currency) THEN
      RAISE EXCEPTION 'SALE_RECEIPT_IDENTITY_MISMATCH';
    END IF;

    RETURN QUERY SELECT v_receipt.id, 'replayed'::text, true;
    RETURN;
  END IF;

  INSERT INTO public.sales_receipts (
    provider_event_id, provider_session_id, provider_payment_intent_id,
    buyer_user_id, buyer_email, catalog_product_id, product_code,
    product_name_snapshot, amount_subtotal_cents, amount_tax_cents,
    amount_discount_cents, amount_total_cents, currency, payment_status,
    fulfillment_status, metadata
  )
  VALUES (
    p_provider_event_id, p_provider_session_id, p_provider_payment_id,
    p_user_id, p_customer_email, v_catalog_product_id, 'magis_' || p_plan_code,
    v_purchase.name, coalesce(p_amount_subtotal_cents, p_amount_total_cents),
    coalesce(p_amount_tax_cents, 0), coalesce(p_amount_discount_cents, 0),
    p_amount_total_cents, upper(p_currency), 'paid', 'completed',
    jsonb_build_object('source', 'magis_credit_checkout', 'plan_code', p_plan_code)
  )
  ON CONFLICT (provider_session_id) DO NOTHING
  RETURNING id INTO v_receipt_id;

  IF v_receipt_id IS NULL THEN
    SELECT *
    INTO v_receipt
    FROM public.sales_receipts AS sr
    WHERE sr.provider_session_id = p_provider_session_id
    FOR UPDATE;

    IF NOT FOUND OR v_receipt.buyer_user_id IS DISTINCT FROM p_user_id
       OR v_receipt.product_code IS DISTINCT FROM ('magis_' || p_plan_code)
       OR v_receipt.amount_total_cents <> p_amount_total_cents
       OR lower(v_receipt.currency) <> lower(p_currency) THEN
      RAISE EXCEPTION 'SALE_RECEIPT_IDENTITY_MISMATCH';
    END IF;

    RETURN QUERY SELECT v_receipt.id, 'replayed'::text, true;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_receipt_id, 'recorded'::text, false;
END;
$$;

REVOKE ALL ON FUNCTION public.record_credit_sale_receipt(
  uuid, text, text, text, text, text, integer, integer, integer, integer, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_credit_sale_receipt(
  uuid, text, text, text, text, text, integer, integer, integer, integer, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.record_payment_link_sale(
  p_provider_event_id text,
  p_provider_session_id text,
  p_payment_intent_id text,
  p_payment_link_id text,
  p_buyer_user_id uuid,
  p_customer_email text,
  p_amount_total_cents integer,
  p_amount_subtotal_cents integer,
  p_amount_tax_cents integer,
  p_amount_discount_cents integer,
  p_currency text,
  p_force_review boolean DEFAULT false,
  p_review_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(receipt_id uuid, status text, fulfillment_status text, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product public.commercial_products%ROWTYPE;
  v_product_found boolean := false;
  v_receipt public.sales_receipts%ROWTYPE;
  v_receipt_id uuid;
  v_product_code text;
  v_product_name text;
  v_fulfillment_status text;
  v_review_reason text;
  v_currency text;
  v_user_id uuid;
  v_event_type text;
BEGIN
  IF p_provider_event_id IS NULL OR btrim(p_provider_event_id) = ''
     OR p_provider_session_id IS NULL OR btrim(p_provider_session_id) = ''
     OR p_amount_total_cents IS NULL OR p_amount_total_cents <= 0
     OR p_currency IS NULL OR char_length(p_currency) <> 3 THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_LINK_SALE_REFERENCE';
  END IF;

  v_currency := upper(p_currency);
  SELECT *
  INTO v_product
  FROM public.commercial_products AS cp
  WHERE cp.stripe_payment_link_id = p_payment_link_id
    AND cp.active = true
  LIMIT 1;
  v_product_found := FOUND;

  IF p_force_review THEN
    v_review_reason := coalesce(nullif(p_review_reason, ''), 'manual_review_requested');
  ELSIF NOT v_product_found THEN
    v_review_reason := 'unmapped_stripe_checkout';
  ELSIF v_product.fulfillment_mode = 'credits' THEN
    v_review_reason := 'credit_product_missing_entitlement_metadata';
  ELSIF v_product.expected_amount_cents <> p_amount_total_cents
     OR v_product.currency <> v_currency THEN
    v_review_reason := 'amount_currency_mismatch';
  END IF;

  IF v_product_found THEN
    v_product_code := v_product.product_code;
    v_product_name := v_product.name;
  ELSE
    v_product_code := NULL;
    v_product_name := 'Unmapped Stripe Checkout';
  END IF;

  IF v_review_reason IS NOT NULL THEN
    v_fulfillment_status := 'review_required';
  ELSIF v_product.fulfillment_mode = 'none' THEN
    v_fulfillment_status := 'completed';
  ELSE
    -- v1 deliberately queues fulfillment; it does not pretend that a product was delivered.
    v_fulfillment_status := 'manual_required';
  END IF;

  IF p_buyer_user_id IS NOT NULL THEN
    SELECT u.id INTO v_user_id
    FROM auth.users AS u
    WHERE u.id = p_buyer_user_id
    LIMIT 1;
  END IF;

  SELECT *
  INTO v_receipt
  FROM public.sales_receipts AS sr
  WHERE sr.provider_session_id = p_provider_session_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_receipt.product_code IS DISTINCT FROM v_product_code
       OR v_receipt.amount_total_cents <> p_amount_total_cents
       OR v_receipt.currency <> v_currency THEN
      RAISE EXCEPTION 'SALE_RECEIPT_IDENTITY_MISMATCH';
    END IF;

    RETURN QUERY SELECT v_receipt.id, 'replayed'::text, v_receipt.fulfillment_status, true;
    RETURN;
  END IF;

  INSERT INTO public.sales_receipts (
    provider_event_id, provider_session_id, provider_payment_intent_id,
    provider_payment_link_id, buyer_user_id, buyer_email, catalog_product_id,
    product_code, product_name_snapshot, amount_subtotal_cents, amount_tax_cents,
    amount_discount_cents, amount_total_cents, currency, payment_status,
    fulfillment_status, review_reason, metadata
  )
  VALUES (
    p_provider_event_id, p_provider_session_id, p_payment_intent_id,
    p_payment_link_id, v_user_id, p_customer_email,
    CASE WHEN v_product_found THEN v_product.id ELSE NULL END,
    v_product_code, v_product_name,
    coalesce(p_amount_subtotal_cents, p_amount_total_cents),
    coalesce(p_amount_tax_cents, 0), coalesce(p_amount_discount_cents, 0),
    p_amount_total_cents, v_currency, 'paid',
    v_fulfillment_status, v_review_reason, coalesce(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (provider_session_id) DO NOTHING
  RETURNING id INTO v_receipt_id;

  IF v_receipt_id IS NULL THEN
    SELECT *
    INTO v_receipt
    FROM public.sales_receipts AS sr
    WHERE sr.provider_session_id = p_provider_session_id
    FOR UPDATE;

    IF NOT FOUND OR v_receipt.product_code IS DISTINCT FROM v_product_code
       OR v_receipt.amount_total_cents <> p_amount_total_cents
       OR v_receipt.currency <> v_currency THEN
      RAISE EXCEPTION 'SALE_RECEIPT_IDENTITY_MISMATCH';
    END IF;

    RETURN QUERY SELECT v_receipt.id, 'replayed'::text, v_receipt.fulfillment_status, true;
    RETURN;
  END IF;

  IF v_fulfillment_status IN ('manual_required', 'review_required') THEN
    v_event_type := CASE
      WHEN v_fulfillment_status = 'review_required'
        THEN 'commercial.sale_review_required'
      ELSE 'commercial.manual_fulfillment_required'
    END;

    INSERT INTO public.sales_fulfillment_outbox (
      sale_receipt_id, event_type, payload
    )
    VALUES (
      v_receipt_id, v_event_type,
      jsonb_build_object(
        'sale_receipt_id', v_receipt_id,
        'product_code', v_product_code,
        'product_name', v_product_name,
        'fulfillment_status', v_fulfillment_status,
        'review_reason', v_review_reason,
        'customer_email', p_customer_email
      )
    )
    ON CONFLICT (sale_receipt_id, event_type) DO NOTHING;
  END IF;

  RETURN QUERY SELECT v_receipt_id, 'recorded'::text, v_fulfillment_status, false;
END;
$$;

REVOKE ALL ON FUNCTION public.record_payment_link_sale(
  text, text, text, text, uuid, text, integer, integer, integer, integer, text, boolean, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_link_sale(
  text, text, text, text, uuid, text, integer, integer, integer, integer, text, boolean, text, jsonb
) TO service_role;
