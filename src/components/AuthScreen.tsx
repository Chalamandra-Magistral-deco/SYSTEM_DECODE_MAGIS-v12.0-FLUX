import { FormEvent, useState } from 'react';
import { supabase, supabaseConfigured } from '../services/supabaseClient';

const AuthScreen = () => {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;

    setBusy(true);
    setMessage('');
    try {
      if (mode === 'sign-up') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setMessage('Account created. Check your email to confirm before signing in.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 border border-neon-purple p-6 font-mono shadow-glow-purple">
        <h1 className="text-2xl font-bold text-neon-cyan">MAGIS // AUTH</h1>
        {!supabaseConfigured ? (
          <p className="text-sm text-neon-red">
            Authentication is unavailable. Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
          </p>
        ) : (
          <>
            <label className="block text-sm">
              EMAIL
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                className="mt-1 w-full border border-neon-purple bg-black p-2 text-white"
              />
            </label>
            <label className="block text-sm">
              PASSWORD
              <input
                type="password"
                autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                minLength={8}
                required
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="mt-1 w-full border border-neon-purple bg-black p-2 text-white"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full border border-neon-cyan p-2 text-neon-cyan disabled:opacity-50"
            >
              {busy ? 'PROCESSING...' : mode === 'sign-up' ? 'CREATE ACCOUNT' : 'SIGN IN'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up');
                setMessage('');
              }}
              className="w-full text-sm text-neon-purple underline"
            >
              {mode === 'sign-up' ? 'Already registered? Sign in.' : 'New operator? Create an account.'}
            </button>
          </>
        )}
        {message && <p role="status" className="whitespace-pre-wrap text-sm text-neon-gold">{message}</p>}
      </form>
    </main>
  );
};

export default AuthScreen;
