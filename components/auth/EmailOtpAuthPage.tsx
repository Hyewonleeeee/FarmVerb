'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import { getEmailOtpErrorMessage, getSafeAuthRedirectPath, normalizeAuthEmail } from '@/lib/auth/email-otp';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

type AuthStep = 'email' | 'otp' | 'success';

const RESEND_COOLDOWN_SECONDS = 60;

export default function EmailOtpAuthPage() {
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [step, setStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success' | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  const destination = useMemo(() => {
    if (typeof window === 'undefined') {
      return '/mypage';
    }

    return getSafeAuthRedirectPath(window.location.search);
  }, []);

  useEffect(() => {
    let mounted = true;

    try {
      const supabase = createBrowserSupabaseClient();
      supabase.auth.getSession().then(({ data }) => {
        if (mounted && data.session) {
          window.location.assign(destination);
        }
      });
    } catch (error) {
      setMessage(getEmailOtpErrorMessage(error));
      setMessageType('error');
    }

    return () => {
      mounted = false;
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, [destination]);

  useEffect(() => {
    if (resendSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setResendSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  const sendCode = async (normalizedEmail: string) => {
    const supabase = createBrowserSupabaseClient();
    return supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
        data: { signup_method: 'email_otp' }
      }
    });
  };

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = normalizeAuthEmail(email);
    if (!normalizedEmail) {
      setMessage('Please enter your email address.');
      setMessageType('error');
      return;
    }

    setIsSubmitting(true);
    setMessage('');
    setMessageType('');

    try {
      const { error } = await sendCode(normalizedEmail);
      if (error) {
        setMessage(getEmailOtpErrorMessage(error));
        setMessageType('error');
        return;
      }

      setEmail(normalizedEmail);
      setOtp('');
      setStep('otp');
      setResendSeconds(RESEND_COOLDOWN_SECONDS);
      setMessage('We sent a 6-digit sign-in code to your email.');
      setMessageType('success');
    } catch (error) {
      setMessage(getEmailOtpErrorMessage(error));
      setMessageType('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedOtp = otp.replace(/\D/g, '');
    if (!normalizedOtp) {
      setMessage('Please enter the 6-digit code from your email.');
      setMessageType('error');
      return;
    }

    if (normalizedOtp.length !== 6) {
      setMessage('The sign-in code must be 6 digits.');
      setMessageType('error');
      return;
    }

    setIsSubmitting(true);
    setMessage('');
    setMessageType('');

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: normalizedOtp,
        type: 'email'
      });

      if (error) {
        setMessage(getEmailOtpErrorMessage(error, 'verify'));
        setMessageType('error');
        return;
      }

      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession();
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (sessionError || userError || !session || !userData.user) {
        setMessage('The code was accepted, but the sign-in session could not be confirmed. Please try again.');
        setMessageType('error');
        return;
      }

      setStep('success');
      setMessage('');
      setMessageType('');
      redirectTimerRef.current = setTimeout(() => {
        window.location.assign(destination);
      }, 1000);
    } catch (error) {
      setMessage(getEmailOtpErrorMessage(error, 'verify'));
      setMessageType('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (resendSeconds > 0 || isResending) {
      return;
    }

    setIsResending(true);
    setMessage('');
    setMessageType('');

    try {
      const { error } = await sendCode(email);
      if (error) {
        setMessage(getEmailOtpErrorMessage(error));
        setMessageType('error');
        return;
      }

      setOtp('');
      setResendSeconds(RESEND_COOLDOWN_SECONDS);
      setMessage('A new 6-digit code was sent to your email.');
      setMessageType('success');
    } catch (error) {
      setMessage(getEmailOtpErrorMessage(error));
      setMessageType('error');
    } finally {
      setIsResending(false);
    }
  };

  const handleChangeEmail = () => {
    setStep('email');
    setOtp('');
    setMessage('');
    setMessageType('');
    setResendSeconds(0);
  };

  const redirectCopy = destination === '/mypage' ? 'Redirecting to My Page...' : 'Redirecting...';

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
        <section className="auth-card" aria-labelledby="email-otp-title">
          {step === 'success' ? (
            <div className="auth-success-state" role="status" aria-live="polite">
              <span className="auth-success-icon" aria-hidden="true">
                ✓
              </span>
              <p className="auth-overline">Welcome to FarmVerb</p>
              <h1 id="email-otp-title" className="auth-title">
                Signed in successfully
              </h1>
              <p className="auth-copy">{redirectCopy}</p>
            </div>
          ) : (
            <>
              <p className="auth-overline">{step === 'otp' ? 'Email Verification' : 'Passwordless Sign In'}</p>
              <h1 id="email-otp-title" className="auth-title">
                {step === 'otp' ? 'Check your email' : 'Sign In'}
              </h1>
              <p className="auth-copy">
                {step === 'otp'
                  ? 'Enter the 6-digit code sent to your email.'
                  : 'Enter your email to sign in or create an account. No password required.'}
              </p>

              {step === 'email' ? (
                <form className="auth-form" onSubmit={handleEmailSubmit}>
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
                    {isSubmitting ? 'Sending code...' : 'Continue'}
                  </button>
                </form>
              ) : (
                <form className="auth-form" onSubmit={handleOtpSubmit}>
                  <div className="auth-otp-email">
                    <span>Code sent to</span>
                    <strong>{email}</strong>
                  </div>

                  <label className="auth-label" htmlFor="sign-in-otp">
                    6-digit code
                  </label>
                  <input
                    id="sign-in-otp"
                    className="auth-input auth-otp-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    autoFocus
                    required
                  />

                  <button className="auth-submit" type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Verifying...' : 'Verify and sign in'}
                  </button>

                  <div className="auth-otp-actions">
                    <button
                      type="button"
                      className="auth-link-button"
                      onClick={() => void handleResend()}
                      disabled={resendSeconds > 0 || isResending}
                    >
                      {isResending
                        ? 'Sending...'
                        : resendSeconds > 0
                          ? `Resend code in ${resendSeconds}s`
                          : 'Resend code'}
                    </button>
                    <button type="button" className="auth-link-button" onClick={handleChangeEmail}>
                      Change email
                    </button>
                  </div>
                </form>
              )}

              {message ? (
                <p
                  className={`auth-message ${messageType === 'error' ? 'is-error' : 'is-success'}`}
                  role={messageType === 'error' ? 'alert' : 'status'}
                >
                  {message}
                </p>
              ) : null}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
