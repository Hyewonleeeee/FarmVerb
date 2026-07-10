'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import { getMagicLinkErrorMessage, getMagicLinkRedirectUrl, normalizeMagicLinkEmail } from '@/lib/auth/magic-link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

type MagicLinkAuthPageProps = {
  mode: 'login' | 'signup';
};

const copyByMode = {
  login: {
    overline: 'Welcome Back',
    title: 'Login',
    intro: 'Enter your email and we will send you a secure sign-in link. No password required.',
    submit: 'Send Magic Link',
    submitting: 'Sending link...',
    success: 'If an account exists for this email, we sent a secure sign-in link.',
    helperPrefix: 'New to FarmVerb?',
    helperHref: '/signup',
    helperLabel: 'Create an account with Magic Link'
  },
  signup: {
    overline: 'Start Your Account',
    title: 'Sign Up',
    intro: 'Create your FarmVerb account with a secure email link. No password required.',
    submit: 'Send Sign Up Link',
    submitting: 'Sending link...',
    success: 'We sent a secure account link to your email.',
    helperPrefix: 'Already have an account?',
    helperHref: '/login',
    helperLabel: 'Go to Login'
  }
} as const;

export default function MagicLinkAuthPage({ mode }: MagicLinkAuthPageProps) {
  const pageCopy = copyByMode[mode];
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
          shouldCreateUser: mode === 'signup',
          data: mode === 'signup' ? { signup_method: 'magic_link' } : undefined
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
      setMessage(pageCopy.success);
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
          <p className="auth-overline">{linkSent ? 'Check Your Inbox' : pageCopy.overline}</p>
          <h1 id="magic-link-title" className="auth-title">
            {linkSent ? 'Check your email' : pageCopy.title}
          </h1>
          <p className="auth-copy">
            {linkSent ? `Open the link sent to ${email} to continue to My Page.` : pageCopy.intro}
          </p>

          {!linkSent ? (
            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="auth-label" htmlFor={`${mode}-email`}>
                Email
              </label>
              <input
                id={`${mode}-email`}
                className="auth-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />

              <button className="auth-submit" type="submit" disabled={isSubmitting}>
                {isSubmitting ? pageCopy.submitting : pageCopy.submit}
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

          <p className="auth-helper">
            {pageCopy.helperPrefix} <Link href={pageCopy.helperHref}>{pageCopy.helperLabel}</Link>.
          </p>
        </section>
      </main>
    </div>
  );
}
