'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AuthPageHeader from '@/components/auth/AuthPageHeader';

type ApprovalState = 'loading' | 'success' | 'error';

type TossApprovalResponse = {
  ok?: boolean;
  payment?: {
    orderId?: string;
    orderName?: string;
    method?: string;
    totalAmount?: number;
    approvedAt?: string;
  };
  errorCode?: string;
  error?: string;
  message?: string;
  detail?: string | null;
};

function formatKrw(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }

  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0
  }).format(value);
}

export default function SuccessPage() {
  const [state, setState] = useState<ApprovalState>('loading');
  const [message, setMessage] = useState('Approving payment...');
  const [payment, setPayment] = useState<TossApprovalResponse['payment'] | null>(null);

  useEffect(() => {
    const confirmPayment = async () => {
      const params = new URLSearchParams(window.location.search);
      const paymentKey = params.get('paymentKey');
      const orderId = params.get('orderId');
      const amountRaw = params.get('amount');
      const amount = amountRaw ? Number(amountRaw) : NaN;

      if (!paymentKey || !orderId || Number.isNaN(amount)) {
        setState('error');
        setMessage('Missing payment information in success URL.');
        return;
      }

      try {
        const response = await fetch('/api/toss/confirm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            paymentKey,
            orderId,
            amount
          })
        });

        const payload = (await response.json().catch(() => null)) as TossApprovalResponse | null;

        if (!response.ok || !payload?.ok) {
          setState('error');
          setMessage(payload?.message || payload?.error || 'Payment approval failed.');
          return;
        }

        setPayment(payload.payment ?? null);
        setState('success');
        setMessage('Payment completed and approved.');
      } catch {
        setState('error');
        setMessage('Could not verify payment right now. Please try again.');
      }
    };

    void confirmPayment();
  }, []);

  const amountLabel = useMemo(() => formatKrw(payment?.totalAmount), [payment?.totalAmount]);

  return (
    <div className="auth-page-shell">
      <AuthPageHeader />

      <main className="auth-page-main">
        <section className="auth-card">
          <p className="auth-overline">Payment Result</p>
          <h1 className="auth-title">{state === 'success' ? 'Payment Success' : state === 'error' ? 'Payment Error' : 'Approving...'}</h1>
          <p className="auth-copy">{message}</p>

          {state === 'success' ? (
            <div className="mypage-account-view" style={{ marginTop: '1rem' }}>
              <div className="mypage-account-row">
                <span className="mypage-account-label">Order</span>
                <strong className="mypage-account-value">{payment?.orderId ?? '-'}</strong>
              </div>
              <div className="mypage-account-row">
                <span className="mypage-account-label">Product</span>
                <strong className="mypage-account-value">{payment?.orderName ?? '-'}</strong>
              </div>
              <div className="mypage-account-row">
                <span className="mypage-account-label">Amount</span>
                <strong className="mypage-account-value">{amountLabel}</strong>
              </div>
              <div className="mypage-account-row">
                <span className="mypage-account-label">Method</span>
                <strong className="mypage-account-value">{payment?.method ?? '-'}</strong>
              </div>
            </div>
          ) : null}

          <div className="mypage-form-actions" style={{ marginTop: '1rem' }}>
            <Link href="/checkout" className="auth-submit auth-submit-secondary">
              Try Again
            </Link>
            <Link href="/mypage" className="auth-submit">
              Go to My Page
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
