'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AuthPageHeader from '@/components/auth/AuthPageHeader';

export default function FailPage() {
  const [errorCode, setErrorCode] = useState('-');
  const [errorMessage, setErrorMessage] = useState('Payment failed.');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const message = params.get('message');

    if (code) {
      setErrorCode(code);
    }
    if (message) {
      setErrorMessage(message);
    }
  }, []);

  return (
    <div className="auth-page-shell">
      <AuthPageHeader />

      <main className="auth-page-main">
        <section className="auth-card">
          <p className="auth-overline">Payment Result</p>
          <h1 className="auth-title">Payment Failed</h1>
          <p className="auth-copy">{errorMessage}</p>

          <div className="mypage-account-view" style={{ marginTop: '1rem' }}>
            <div className="mypage-account-row">
              <span className="mypage-account-label">Error Code</span>
              <strong className="mypage-account-value">{errorCode}</strong>
            </div>
          </div>

          <div className="mypage-form-actions" style={{ marginTop: '1rem' }}>
            <Link href="/checkout" className="auth-submit">
              Try Again
            </Link>
            <Link href="/cart" className="auth-submit auth-submit-secondary">
              Back to Cart
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
