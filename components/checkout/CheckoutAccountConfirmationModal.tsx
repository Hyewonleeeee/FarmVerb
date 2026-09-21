'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

type CheckoutAccountConfirmationModalProps = {
  id: string;
  email: string | null;
  error: string | null;
  isPreparing: boolean;
  onCancel: () => void;
  onContinue: () => void;
};

type CheckoutAccountModalTheme = 'organic' | 'nebula' | 'glitch';

function getCheckoutAccountModalTheme(): CheckoutAccountModalTheme {
  const siteRoot = document.querySelector('.farmverb-root');

  if (siteRoot?.classList.contains('theme-nebula')) {
    return 'nebula';
  }

  if (siteRoot?.classList.contains('theme-glitch')) {
    return 'glitch';
  }

  return 'organic';
}

export default function CheckoutAccountConfirmationModal({
  id,
  email,
  error,
  isPreparing,
  onCancel,
  onContinue
}: CheckoutAccountConfirmationModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const continueButtonRef = useRef<HTMLButtonElement>(null);
  const isPreparingRef = useRef(isPreparing);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    isPreparingRef.current = isPreparing;
    onCancelRef.current = onCancel;
  }, [isPreparing, onCancel]);

  useEffect(() => {
    if (!email) {
      return;
    }

    const previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    continueButtonRef.current?.focus();

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !isPreparingRef.current) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }

      if (event.key === 'Tab') {
        const focusableElements = Array.from(
          dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []
        );

        if (focusableElements.length === 0) {
          event.preventDefault();
          dialogRef.current?.focus();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedElement?.focus();
    };
  }, [email]);

  if (!email || typeof document === 'undefined') {
    return null;
  }

  const modalTheme = getCheckoutAccountModalTheme();

  return createPortal(
    <div
      className={`checkout-account-modal-backdrop checkout-account-modal-theme-${modalTheme}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPreparing) {
          onCancel();
        }
      }}
    >
      <section
        ref={dialogRef}
        id={id}
        className="checkout-account-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        tabIndex={-1}
      >
        <p className="checkout-account-modal-eyebrow">Secure Checkout</p>
        <h2 id={`${id}-title`}>Confirm your FarmVerb account</h2>
        <p id={`${id}-description`} className="checkout-account-modal-copy">
          Your purchase will be linked to this FarmVerb account:
        </p>
        <strong className="checkout-account-modal-email">{email}</strong>
        <p className="checkout-account-modal-help">
          Please make sure this is the account you want to use for your purchase.
        </p>
        {error ? (
          <p className="checkout-account-modal-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="checkout-account-modal-actions">
          <button type="button" className="checkout-account-modal-cancel" onClick={onCancel} disabled={isPreparing}>
            Cancel
          </button>
          <button
            ref={continueButtonRef}
            type="button"
            className="checkout-account-modal-continue"
            onClick={onContinue}
            disabled={isPreparing}
            aria-busy={isPreparing}
          >
            {isPreparing ? 'Preparing checkout…' : 'Continue to Checkout'}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
