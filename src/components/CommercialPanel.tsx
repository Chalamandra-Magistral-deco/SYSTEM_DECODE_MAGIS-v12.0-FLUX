import { useCallback, useEffect, useMemo, useState } from 'react';
import { CreditCard, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { authenticatedFetch, parseApiResponse } from '../services/apiClient';

type Plan = {
  id: string;
  code: string;
  name: string;
  credits: number;
  price_cents: number;
  currency: string;
  active: boolean;
};

type UserPlan = {
  status: string | null;
  plan?: {
    code: string;
    name: string;
    credits: number;
    price_cents: number;
    currency: string;
  } | null;
};

type CommercialSnapshot = {
  balance: number;
  plan: UserPlan['plan'];
  planStatus: string | null;
};

const formatPrice = (cents: number, currency: string) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);

const CommercialPanel = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [snapshot, setSnapshot] = useState<CommercialSnapshot>({
    balance: 0,
    plan: null,
    planStatus: null,
  });
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [error, setError] = useState('');

  const checkoutState = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get('checkout');
    if (value === 'success') return 'PAYMENT RETURNED. CREDIT BALANCE UPDATES AFTER SERVER CONFIRMATION.';
    if (value === 'cancelled') return 'CHECKOUT CANCELLED. NO CREDITS WERE ADDED.';
    return '';
  }, []);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError('');

    const [plansResult, userPlanResult, creditResult] = await Promise.all([
      supabase
        .from('plans')
        .select('id,code,name,credits,price_cents,currency,active')
        .eq('active', true)
        .order('price_cents'),
      supabase
        .from('user_plans')
        .select('status,plan:plans(code,name,credits,price_cents,currency)')
        .maybeSingle(),
      supabase
        .from('credit_accounts')
        .select('balance')
        .maybeSingle(),
    ]);

    const firstError = plansResult.error || userPlanResult.error || creditResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const userPlan = userPlanResult.data as UserPlan | null;
    const plan = Array.isArray(userPlan?.plan) ? userPlan?.plan[0] ?? null : userPlan?.plan ?? null;

    setPlans((plansResult.data ?? []) as Plan[]);
    setSnapshot({
      balance: creditResult.data?.balance ?? 0,
      plan,
      planStatus: userPlan?.status ?? null,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startCheckout = async (planCode: string) => {
    setBusyPlan(planCode);
    setError('');
    try {
      const response = await authenticatedFetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode }),
      });
      const data = await parseApiResponse<{ url: string }>(
        response,
        'CHECKOUT INITIALIZATION FAILED.'
      );
      if (typeof data.url !== 'string' || !data.url.startsWith('https://checkout.stripe.com/')) {
        throw new Error('Invalid checkout destination.');
      }
      window.location.assign(data.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CHECKOUT INITIALIZATION FAILED.');
      setBusyPlan(null);
    }
  };

  const paidPlans = plans.filter(plan => plan.price_cents > 0);

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-2 font-mono text-neon-gold">
      <div className="border-2 border-neon-gold bg-neon-gold/5 p-4 shadow-glow-gold">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs tracking-[0.25em] text-neon-gold/70">MAGIS COMMERCIAL CORE</div>
            <div className="mt-1 text-3xl font-bold text-white">{snapshot.balance}</div>
            <div className="text-xs text-neon-gold/70">AVAILABLE CREDITS</div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="border border-neon-gold p-2 text-neon-gold hover:bg-neon-gold hover:text-black disabled:opacity-50"
            title="Refresh credit balance"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="mt-3 text-xs text-white/70">
          BASE PLAN: {snapshot.plan?.name ?? 'MAGIS Free'} · STATUS: {snapshot.planStatus ?? 'active'}
        </div>
      </div>

      {checkoutState && (
        <div className="border border-neon-cyan bg-neon-cyan/5 p-3 text-xs text-neon-cyan">
          {checkoutState}
        </div>
      )}

      {error && (
        <div className="border border-neon-red bg-neon-red/5 p-3 text-xs text-neon-red" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse border border-white/10 p-4 text-xs text-white/60">
          LOADING COMMERCIAL STATE...
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {paidPlans.map(plan => (
            <article
              key={plan.id}
              className="flex flex-col justify-between border border-neon-gold/60 bg-black/40 p-4"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold text-white">{plan.name}</h2>
                  <CreditCard size={18} />
                </div>
                <div className="mt-3 text-3xl font-bold">{plan.credits}</div>
                <div className="text-xs text-neon-gold/70">CREDITS · ONE-TIME PACK</div>
                <div className="mt-4 text-2xl text-white">
                  {formatPrice(plan.price_cents, plan.currency)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void startCheckout(plan.code)}
                disabled={busyPlan !== null}
                className="mt-6 flex items-center justify-center gap-2 border border-neon-gold px-4 py-3 font-bold tracking-widest text-neon-gold transition-all hover:bg-neon-gold hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyPlan === plan.code ? 'REDIRECTING...' : 'ADD CREDITS'}
              </button>
            </article>
          ))}
        </div>
      )}

      <div className="mt-auto border-t border-neon-gold/20 pt-3 text-[10px] text-white/50">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} />
          PAYMENT IS HANDLED BY STRIPE HOSTED CHECKOUT. CREDITS ARE GRANTED SERVER-SIDE AFTER SIGNED EVENT VALIDATION.
        </div>
      </div>
    </div>
  );
};

export default CommercialPanel;
