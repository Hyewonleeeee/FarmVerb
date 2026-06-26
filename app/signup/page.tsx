'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import CountrySelect from '@/components/ui/CountrySelect';
import {
  combineSignupName,
  validateSignupEmail,
  validateSignupName,
  validateSignupPassword
} from '@/lib/auth/signup-validation';
import { DEFAULT_COUNTRY_NAME, normalizeCountryName } from '@/lib/ui/country';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

type ValidationResponse =
  | {
      ok: true;
      normalized?: {
        firstName?: string;
        lastName?: string;
        name?: string;
        email?: string;
        country?: string;
      };
    }
  | {
      ok: false;
      message?: string;
      fieldErrors?: {
        firstName?: string | null;
        lastName?: string | null;
        name?: string | null;
        email?: string | null;
        password?: string | null;
      };
    };

const localValidationRoute = '/api/signup/validate';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return '';
}

function getSignupConnectivityMessage(error: unknown) {
  const message = getErrorMessage(error);

  if (message.includes('Missing Supabase environment variables')) {
    return 'Signup is not configured correctly: missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.';
  }

  if (message.includes('Invalid NEXT_PUBLIC_SUPABASE_URL')) {
    return 'Signup is not configured correctly: NEXT_PUBLIC_SUPABASE_URL is invalid.';
  }

  if (/redirect|not allowed|url/i.test(message)) {
    return 'Signup redirect is not configured correctly. Please add farmverb.com and the deployed URL to Supabase Auth redirect URLs.';
  }

  if (/failed to fetch|fetch failed|networkerror|load failed|supabase unavailable/i.test(message)) {
    return 'Could not reach Supabase Auth. Please check your network, Supabase project status, and production environment variables.';
  }

  return message || 'Signup failed. Please try again.';
}

function getSignupValidationRouteMessage(error: unknown) {
  const message = getErrorMessage(error);

  if (/failed to fetch|fetch failed|networkerror|load failed/i.test(message)) {
    return 'Could not reach the FarmVerb signup validation API. Please check that /api/signup/validate is deployed correctly.';
  }

  return message || 'Signup validation failed. Please try again.';
}

function SignupPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [country, setCountry] = useState(DEFAULT_COUNTRY_NAME);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEmailVerificationState, setShowEmailVerificationState] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const firstNameValidation = validateSignupName(firstName);
  const lastNameValidation = validateSignupName(lastName);
  const emailValidation = validateSignupEmail(email);
  const passwordValidation = validateSignupPassword(password);
  const sanitizedFirstName = firstNameValidation.normalizedName;
  const sanitizedLastName = lastNameValidation.normalizedName;
  const sanitizedName = combineSignupName(sanitizedFirstName, sanitizedLastName);
  const sanitizedEmail = emailValidation.normalizedEmail;
  const sanitizedCountry = normalizeCountryName(country);
  const canSubmit =
    firstNameValidation.valid &&
    lastNameValidation.valid &&
    emailValidation.valid &&
    passwordValidation.valid &&
    !isSubmitting &&
    !showEmailVerificationState;

  const showFirstNameFeedback = hasSubmitted || firstName.trim().length > 0;
  const showLastNameFeedback = hasSubmitted || lastName.trim().length > 0;
  const showEmailFeedback = hasSubmitted || email.trim().length > 0;
  const showPasswordFeedback = hasSubmitted || password.length > 0;

  useEffect(() => {
    let supabase;
    try {
      supabase = createBrowserSupabaseClient();
    } catch (error) {
      setMessage(getSignupConnectivityMessage(error));
      return;
    }

    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted && data.session) {
          router.replace('/mypage');
        }
      })
      .catch((error) => {
        if (mounted) {
          setMessage(getSignupConnectivityMessage(error));
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
      const response = await fetch(localValidationRoute, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          firstName,
          lastName,
          name: sanitizedName,
          email,
          password,
          country
        })
      });

      const payload = (await response.json().catch(() => null)) as ValidationResponse | null;

      if (!response.ok || !payload) {
        if (response.status === 404) {
          return {
            ok: false,
            message: 'Signup validation API route was not found. Please check that /api/signup/validate exists in production.',
            normalized: null
          };
        }

        return {
          ok: false,
          message:
            payload && 'message' in payload
              ? payload.message
              : `Signup validation failed with status ${response.status}. Please try again.`,
          normalized: null
        };
      }

      if (!payload.ok) {
        return {
          ok: false,
          message:
            payload.message ??
            payload.fieldErrors?.firstName ??
            payload.fieldErrors?.lastName ??
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
          firstName: payload.normalized?.firstName ?? sanitizedFirstName,
          lastName: payload.normalized?.lastName ?? sanitizedLastName,
          name: payload.normalized?.name ?? sanitizedName,
          email: payload.normalized?.email ?? sanitizedEmail,
          country: payload.normalized?.country ?? sanitizedCountry
        }
      };
    } catch (error) {
      return {
        ok: false,
        message: getSignupValidationRouteMessage(error),
        normalized: null
      };
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasSubmitted(true);
    setMessage('');

    if (!canSubmit) {
      setMessage(
        firstNameValidation.error ??
          lastNameValidation.error ??
          emailValidation.error ??
          passwordValidation.error ??
          'Please review the highlighted fields.'
      );
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

      let supabase;
      try {
        supabase = createBrowserSupabaseClient();
      } catch (error) {
        setMessage(getSignupConnectivityMessage(error));
        setIsSubmitting(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: serverValidation.normalized.email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: {
            name: serverValidation.normalized.name,
            first_name: serverValidation.normalized.firstName,
            last_name: serverValidation.normalized.lastName,
            country: serverValidation.normalized.country
          }
        }
      });

      if (error) {
        setMessage(getSignupConnectivityMessage(error));
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
    } catch (error) {
      setMessage(getSignupConnectivityMessage(error));
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
              <p className="auth-copy">Create your FarmVerb account with first name, last name, country, email, and password.</p>

              <form className="auth-form" onSubmit={handleSubmit} noValidate>
                <div className="auth-name-grid">
                  <div className="auth-field-stack">
                    <label className="auth-label" htmlFor="signup-first-name">
                      First name
                    </label>
                    <input
                      id="signup-first-name"
                      className="auth-input"
                      type="text"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      onBlur={() => setFirstName(sanitizedFirstName)}
                      aria-invalid={showFirstNameFeedback && !firstNameValidation.valid}
                      aria-describedby={showFirstNameFeedback && !firstNameValidation.valid ? 'signup-first-name-error' : undefined}
                      required
                      maxLength={50}
                    />
                    {showFirstNameFeedback && !firstNameValidation.valid ? (
                      <p className="auth-field-message" id="signup-first-name-error">
                        Please enter your real name in English.
                      </p>
                    ) : (
                      <p className="auth-field-note">English letters only. Spaces, hyphens, and apostrophes are okay.</p>
                    )}
                  </div>

                  <div className="auth-field-stack">
                    <label className="auth-label" htmlFor="signup-last-name">
                      Last name
                    </label>
                    <input
                      id="signup-last-name"
                      className="auth-input"
                      type="text"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      onBlur={() => setLastName(sanitizedLastName)}
                      aria-invalid={showLastNameFeedback && !lastNameValidation.valid}
                      aria-describedby={showLastNameFeedback && !lastNameValidation.valid ? 'signup-last-name-error' : undefined}
                      required
                      maxLength={50}
                    />
                    {showLastNameFeedback && !lastNameValidation.valid ? (
                      <p className="auth-field-message" id="signup-last-name-error">
                        Please enter your real name in English.
                      </p>
                    ) : (
                      <p className="auth-field-note">English letters only. Spaces, hyphens, and apostrophes are okay.</p>
                    )}
                  </div>
                </div>

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

                <div className="auth-password-meta auth-password-meta-inline" id="signup-password-help" aria-live="polite">
                  <span className={`auth-password-strength is-${passwordValidation.strength.toLowerCase()}`}>
                    Strength: {passwordValidation.strength}
                  </span>
                  <span className={`auth-password-pill ${passwordValidation.checklist.minLength ? 'is-met' : ''}`}>8+ chars</span>
                  <span className={`auth-password-pill ${passwordValidation.checklist.lowercase ? 'is-met' : ''}`}>a-z</span>
                  <span className={`auth-password-pill ${passwordValidation.checklist.number ? 'is-met' : ''}`}>0-9</span>
                  <span className={`auth-password-pill ${passwordValidation.checklist.specialChar ? 'is-met' : ''}`}>special</span>
                </div>

                {showPasswordFeedback && !passwordValidation.valid ? (
                  <p className="auth-field-message">{passwordValidation.error}</p>
                ) : null}

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
