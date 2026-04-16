'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEmailVerificationState, setShowEmailVerificationState] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) {
        router.replace('/mypage');
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace('/mypage');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('');
    setShowEmailVerificationState(false);
    setVerificationEmail('');

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const normalizedEmail = email.trim().toLowerCase();

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          name: trimmedName,
          phone: trimmedPhone
        }
      }
    });

    if (error) {
      setMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    if (data.user && data.session) {
      const { error: profileError } = await supabase.from('profiles').upsert(
        {
          id: data.user.id,
          email: normalizedEmail,
          name: trimmedName,
          phone: trimmedPhone
        },
        { onConflict: 'id' }
      );

      if (profileError) {
        setMessage(`Sign up succeeded, but profile save failed: ${profileError.message}`);
        setIsSubmitting(false);
        return;
      }
    }

    if (data.session) {
      setMessage('Sign up successful. Redirecting to My Page...');
      router.push('/mypage');
      router.refresh();
      return;
    }

    setVerificationEmail(data.user?.email ?? normalizedEmail);
    setShowEmailVerificationState(true);
    setIsSubmitting(false);
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
        <section className="auth-card" aria-labelledby="signup-title">
          {!showEmailVerificationState ? (
            <>
              <p className="auth-overline">Start Your Account</p>
              <h1 id="signup-title" className="auth-title">
                Sign Up
              </h1>
              <p className="auth-copy">Create your FarmVerb account with name, phone, email, and password.</p>

              <form className="auth-form" onSubmit={handleSubmit}>
                <label className="auth-label" htmlFor="signup-name">
                  Name
                </label>
                <input
                  id="signup-name"
                  className="auth-input"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />

                <label className="auth-label" htmlFor="signup-phone">
                  Phone
                </label>
                <input
                  id="signup-phone"
                  className="auth-input"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  required
                />

                <label className="auth-label" htmlFor="signup-email">
                  Email
                </label>
                <input
                  id="signup-email"
                  className="auth-input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />

                <label className="auth-label" htmlFor="signup-password">
                  Password
                </label>
                <input
                  id="signup-password"
                  className="auth-input"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                />

                <button className="auth-submit" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating account...' : 'Sign Up'}
                </button>
              </form>

              {message ? <p className="auth-message">{message}</p> : null}

              <p className="auth-helper">
                Already have an account? <Link href="/login">Go to login</Link>.
              </p>
            </>
          ) : (
            <>
              <p className="auth-overline">Account Verification</p>
              <h1 id="signup-title" className="auth-title">
                Check your email
              </h1>
              <p className="auth-copy">
                We sent a verification link to <strong>{verificationEmail || 'your email address'}</strong>.
              </p>
              <p className="auth-copy" style={{ marginTop: '0.5rem' }}>
                Please open your email and confirm your account before logging in.
              </p>
              <p className="auth-copy" style={{ marginTop: '0.5rem' }}>
                If you do not see the email, check your spam folder.
              </p>

              <div style={{ display: 'flex', gap: '0.55rem', marginTop: '1.2rem', flexWrap: 'wrap' }}>
                <Link href="/login" className="auth-submit" style={{ marginTop: 0, textAlign: 'center' }}>
                  Go to Login
                </Link>
                <Link href="/" className="auth-submit auth-submit-secondary" style={{ marginTop: 0, textAlign: 'center' }}>
                  Back to Home
                </Link>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
