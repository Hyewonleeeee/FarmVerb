'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

function getSafeRedirectPath(rawPath: string | null): string {
  if (!rawPath) {
    return '/';
  }

  if (!rawPath.startsWith('/') || rawPath.startsWith('//')) {
    return '/';
  }

  return rawPath;
}

function LoginPageContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const redirectPath = getSafeRedirectPath(searchParams.get('redirect'));

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) {
        window.location.assign(redirectPath);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        window.location.assign(redirectPath);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [redirectPath]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    setMessage('');
    window.location.assign(redirectPath);
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setMessage('Please enter your email first.');
      return;
    }

    setIsResetting(true);
    setMessage('');

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail);

    if (error) {
      setMessage(error.message);
      setIsResetting(false);
      return;
    }

    setMessage('Check your email to reset your password');
    setIsResetting(false);
  };

  return (
    <div className="auth-page-shell">
      <AuthPageHeader />

      <main
        className="auth-page-main"
        style={{
          minHeight: 'calc(100dvh - 120px)',
          margin: '0 auto',
          padding: '1.2rem 0 2.4rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <section className="auth-card" aria-labelledby="login-title">
          <p className="auth-overline">Welcome Back</p>
          <h1 id="login-title" className="auth-title">
            Login
          </h1>
          <p className="auth-copy">Use your email and password to access your FarmVerb account.</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              className="auth-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <label className="auth-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className="auth-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            <button className="auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Logging in...' : 'Login'}
            </button>

            <button
              type="button"
              className="auth-link-button"
              onClick={() => void handleForgotPassword()}
              disabled={isResetting || isSubmitting}
            >
              {isResetting ? 'Sending reset link...' : 'Forgot password?'}
            </button>
          </form>

          {message ? <p className="auth-message">{message}</p> : null}

          <p className="auth-helper">
            Don&apos;t have an account? <Link href="/signup">Create one on the Sign Up page</Link>.
          </p>
        </section>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth-page-shell" />}>
      <LoginPageContent />
    </Suspense>
  );
}
