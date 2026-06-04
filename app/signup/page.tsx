'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import CountrySelect from '@/components/ui/CountrySelect';
import { validateSignupEmail, validateSignupName, validateSignupPassword } from '@/lib/auth/signup-validation';
import { DEFAULT_COUNTRY_NAME, normalizeCountryName } from '@/lib/ui/country';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

type ValidationResponse =
  | {
      ok: true;
      normalized?: {
        name?: string;
        email?: string;
        country?: string;
      };
    }
  | {
      ok: false;
      message?: string;
      fieldErrors?: {
        name?: string | null;
        email?: string | null;
        password?: string | null;
      };
    };

function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [country, setCountry] = useState(DEFAULT_COUNTRY_NAME);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEmailVerificationState, setShowEmailVerificationState] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const nameValidation = validateSignupName(name);
  const emailValidation = validateSignupEmail(email);
  const passwordValidation = validateSignupPassword(password);
  const sanitizedName = nameValidation.normalizedName;
  const sanitizedEmail = emailValidation.normalizedEmail;
  const sanitizedCountry = normalizeCountryName(country);
  const canSubmit =
    nameValidation.valid && emailValidation.valid && passwordValidation.valid && !isSubmitting && !showEmailVerificationState;

  const showNameFeedback = hasSubmitted || name.trim().length > 0;
  const showEmailFeedback = hasSubmitted || email.trim().length > 0;
  const showPasswordFeedback = hasSubmitted || password.length > 0;

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

  const syncServerValidation = async () => {
    try {
      const response = await fetch('/api/signup/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          email,
          password,
          country
        })
      });

      const payload = (await response.json().catch(() => null)) as ValidationResponse | null;

      if (!response.ok || !payload) {
        return {
          ok: false,
          message: payload && 'message' in payload ? payload.message : 'Please enter your real name in English.',
          normalized: null
        };
      }

      if (!payload.ok) {
        return {
          ok: false,
          message:
            payload.message ??
            payload.fieldErrors?.name ??
            payload.fieldErrors?.email ??
            payload.fieldErrors?.password ??
            'Please enter your real name in English.',
          normalized: null
        };
      }

      return {
        ok: true,
        message: '',
        normalized: {
          name: payload.normalized?.name ?? sanitizedName,
          email: payload.normalized?.email ?? sanitizedEmail,
          country: payload.normalized?.country ?? sanitizedCountry
        }
      };
    } catch {
      return {
        ok: false,
        message: 'Please enter your real name in English.',
        normalized: null
      };
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasSubmitted(true);
    setMessage('');

    if (!canSubmit) {
      setMessage(nameValidation.error ?? emailValidation.error ?? passwordValidation.error ?? 'Please review the highlighted fields.');
      return;
    }

    try {
      setIsSubmitting(true);

      const serverValidation = await syncServerValidation();
      if (!serverValidation.ok || !serverValidation.normalized) {
        setMessage(serverValidation.message || 'Please review the highlighted fields.');
        setIsSubmitting(false);
        return;
      }

      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email: serverValidation.normalized.email,
        password,
        options: {
          data: {
            name: serverValidation.normalized.name,
            country: serverValidation.normalized.country
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
            email: serverValidation.normalized.email,
            name: serverValidation.normalized.name,
            country: serverValidation.normalized.country
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
        router.push('/mypage');
        router.refresh();
        return;
      }

      setVerificationEmail(data.user?.email ?? serverValidation.normalized.email);
      setShowEmailVerificationState(true);
      setIsSubmitting(false);
    } catch {
      setMessage('Please enter your real name in English.');
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
        <section className="auth-card" aria-labelledby="signup-title">
          {!showEmailVerificationState ? (
            <>
              <p className="auth-overline">Start Your Account</p>
              <h1 id="signup-title" className="auth-title">
                Sign Up
              </h1>
              <p className="auth-copy">Create your FarmVerb account with name, country, email, and password.</p>

              <form className="auth-form" onSubmit={handleSubmit} noValidate>
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
                  onBlur={() => setName(sanitizedName)}
                  aria-invalid={showNameFeedback && !nameValidation.valid}
                  aria-describedby={showNameFeedback && !nameValidation.valid ? 'signup-name-error' : undefined}
                  required
                  maxLength={50}
                />
                {showNameFeedback && !nameValidation.valid ? (
                  <p className="auth-field-message" id="signup-name-error">
                    Please enter your real name in English.
                  </p>
                ) : (
                  <p className="auth-field-note">English letters only. Spaces, hyphens, and apostrophes are okay.</p>
                )}

                <label className="auth-label" htmlFor="signup-country">
                  Country
                </label>
                <CountrySelect id="signup-country" value={country} onChange={setCountry} />

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
                  onBlur={() => setEmail(sanitizedEmail)}
                  aria-invalid={showEmailFeedback && !emailValidation.valid}
                  aria-describedby={showEmailFeedback && !emailValidation.valid ? 'signup-email-error' : undefined}
                  required
                />
                {showEmailFeedback && !emailValidation.valid ? (
                  <p className="auth-field-message" id="signup-email-error">
                    Please enter a valid email address.
                  </p>
                ) : (
                  <p className="auth-field-note">Your email will be your login ID and needs verification.</p>
                )}

                <label className="auth-label" htmlFor="signup-password">
                  Password
                </label>
                <div className="auth-password-field">
                  <input
                    id="signup-password"
                    className="auth-input auth-password-input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-invalid={showPasswordFeedback && !passwordValidation.valid}
                    aria-describedby="signup-password-help"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>

                <div className="auth-password-meta" id="signup-password-help">
                  <div className="auth-password-strength">
                    Password strength: <strong>{passwordValidation.strength}</strong>
                  </div>
                  <ul className="auth-password-checklist" aria-live="polite">
                    <li className={passwordValidation.checklist.minLength ? 'is-met' : ''}>8+ characters</li>
                    <li className={passwordValidation.checklist.uppercase ? 'is-met' : ''}>One uppercase letter</li>
                    <li className={passwordValidation.checklist.lowercase ? 'is-met' : ''}>One lowercase letter</li>
                    <li className={passwordValidation.checklist.number ? 'is-met' : ''}>One number</li>
                    <li className={passwordValidation.checklist.specialChar ? 'is-met' : ''}>One special character</li>
                  </ul>
                  {showPasswordFeedback && !passwordValidation.valid ? (
                    <p className="auth-field-message">Please complete the password requirements below.</p>
                  ) : null}
                </div>

                <button className="auth-submit" type="submit" disabled={!canSubmit}>
                  {isSubmitting ? 'Creating account...' : 'Sign Up'}
                </button>
              </form>

              {message ? <p className="auth-message is-error">{message}</p> : null}

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
              <p className="auth-copy">Please check your email to verify your account.</p>
              <p className="auth-copy" style={{ marginTop: '0.5rem' }}>
                We sent a verification link to <strong>{verificationEmail || 'your email address'}</strong>.
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

export default function SignupPageWrapper() {
  return <SignupPage />;
}
