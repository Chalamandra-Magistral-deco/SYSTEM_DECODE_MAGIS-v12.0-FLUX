import { FormEvent, useRef, useState } from 'react';
import { supabase, supabaseConfigured } from '../services/supabaseClient';

type AuthMode = 'sign-in' | 'sign-up' | 'reset';

const friendlyAuthError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (message.includes('email not confirmed')) return 'Confirma tu correo antes de iniciar sesión.';
  if (message.includes('user already registered')) return 'Ese correo ya está registrado. Inicia sesión.';
  if (message.includes('rate limit')) return 'Demasiados intentos. Espera un momento y vuelve a probar.';
  return error instanceof Error ? error.message : 'No se pudo completar la autenticación.';
};

const AuthScreen = () => {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);

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
          setMessage('Cuenta creada. Revisa tu correo para confirmar la cuenta antes de entrar.');
        }
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        setMessage('Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setMessage(friendlyAuthError(error));
    } finally {
      setBusy(false);
      requestAnimationFrame(() => emailRef.current?.focus());
    }
  };

  const title = mode === 'sign-up'
    ? 'CREATE OPERATOR ACCOUNT'
    : mode === 'reset'
      ? 'RESET ACCESS'
      : 'SIGN IN TO MAGIS';

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 py-8 text-white">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-5 border border-neon-purple bg-black/80 p-6 font-mono shadow-glow-purple"
        aria-describedby="auth-help"
      >
        <header className="space-y-2">
          <p className="text-xs tracking-[0.3em] text-neon-purple">CHALAMANDRA MAGISTRAL</p>
          <h1 className="text-2xl font-bold text-neon-cyan">MAGIS // {title}</h1>
          <p id="auth-help" className="text-sm text-white/65">
            Multimodal AI workspace for analysis, creation, voice and deployment intelligence.
          </p>
        </header>

        {!supabaseConfigured ? (
          <p className="text-sm text-neon-red" role="alert">
            Authentication is unavailable. Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
          </p>
        ) : (
          <>
            <label className="block text-sm">
              EMAIL
              <input
                ref={emailRef}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                className="mt-1 w-full border border-neon-purple bg-black p-3 text-white"
                aria-label="Email address"
              />
            </label>

            {mode !== 'reset' && (
              <label className="block text-sm">
                PASSWORD
                <input
                  type="password"
                  autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                  minLength={8}
                  required
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  className="mt-1 w-full border border-neon-purple bg-black p-3 text-white"
                  aria-label="Password"
                />
              </label>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full border border-neon-cyan p-3 font-bold text-neon-cyan transition-colors hover:bg-neon-cyan hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy
                ? 'PROCESSING...'
                : mode === 'sign-up'
                  ? 'CREATE ACCOUNT'
                  : mode === 'reset'
                    ? 'SEND RESET LINK'
                    : 'SIGN IN'}
            </button>

            <div className="space-y-2 text-sm">
              {mode === 'sign-in' && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('reset');
                    setMessage('');
                  }}
                  className="w-full text-left text-neon-gold underline underline-offset-4"
                >
                  Forgot password?
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up');
                  setPassword('');
                  setMessage('');
                }}
                className="w-full text-left text-neon-purple underline underline-offset-4"
              >
                {mode === 'sign-up' ? 'Already registered? Sign in.' : 'New operator? Create an account.'}
              </button>

              {mode === 'reset' && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('sign-in');
                    setPassword('');
                    setMessage('');
                  }}
                  className="w-full text-left text-neon-cyan underline underline-offset-4"
                >
                  Back to sign in
                </button>
              )}
            </div>
          </>
        )}

        {message && (
          <p role="status" aria-live="polite" className="border border-neon-gold/40 p-3 text-sm text-neon-gold">
            {message}
          </p>
        )}
      </form>
    </main>
  );
};

export default AuthScreen;
