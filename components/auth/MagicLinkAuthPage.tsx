'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import { getMagicLinkErrorMessage, getMagicLinkRedirectUrl, normalizeMagicLinkEmail } from '@/lib/auth/magic-link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export default function MagicLinkAuthPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success' | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  useEffect(() => {
    let supabase;

    try {
      supabase = createBrowserSupabaseClient();
    } catch (error) {
      setMessage(getMagicLinkErrorMessage(error));
      setMessageType('error');
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) {
        window.location.assign('/mypage');
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        window.location.assign('/mypage');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = normalizeMagicLinkEmail(email);
    if (!normalizedEmail) {
      setMessage('Please enter your email address.');
      setMessageType('error');
      return;
    }

    setIsSubmitting(true);
    setMessage('');
    setMessageType('');

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: getMagicLinkRedirectUrl(),
          shouldCreateUser: true,
          data: { signup_method: 'magic_link' }
        }
      });

      if (error) {
        setMessage(getMagicLinkErrorMessage(error));
        setMessageType('error');
        setIsSubmitting(false);
        return;
      }

      setEmail(normalizedEmail);
      setLinkSent(true);
      setMessage('We sent a secure sign-in link to your email.');
      setMessageType('success');
      setIsSubmitting(false);
    } catch (error) {
      setMessage(getMagicLinkErrorMessage(error));
      setMessageType('error');
      setIsSubmitting(false);
    }
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
        <section className="auth-card" aria-labelledby="magic-link-title">
          <p className="auth-overline">{linkSent ? 'Check Your Inbox' : 'Passwordless Sign In'}</p>
          <h1 id="magic-link-title" className="auth-title">
            {linkSent ? 'Check your inbox' : 'Sign In'}
          </h1>
          <p className="auth-copy">
            {linkSent
              ? `Open the link sent to ${email} to continue to My Page.`
              : 'Enter your email to sign in or create an account. No password required.'}
          </p>

          {!linkSent ? (
            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="auth-label" htmlFor="sign-in-email">
                Email
              </label>
              <input
                id="sign-in-email"
                className="auth-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />

              <button className="auth-submit" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Sending link...' : 'Send sign-in link'}
              </button>
            </form>
          ) : (
            <div className="mypage-form-actions">
              <button
                type="button"
                className="auth-submit auth-submit-secondary"
                onClick={() => {
                  setLinkSent(false);
                  setMessage('');
                  setMessageType('');
                }}
              >
                Use another email
              </button>
              <Link href="/" className="auth-submit" style={{ textAlign: 'center' }}>
                Back to Home
              </Link>
            </div>
          )}

          {message ? <p className={`auth-message ${messageType === 'error' ? 'is-error' : 'is-success'}`}>{message}</p> : null}
        </section>
      </main>
    </div>
  );
}
