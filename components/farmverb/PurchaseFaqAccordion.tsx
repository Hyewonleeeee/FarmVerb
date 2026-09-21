'use client';

import { useState } from 'react';

const PURCHASE_FAQ_ITEMS = [
  {
    question: 'Which email should I use when purchasing?',
    answer: (
      <p>
        We recommend signing in to the FarmVerb account where you want product access. Your purchase is
        linked to the FarmVerb account signed in when checkout starts, even if you use a different payment
        email at Lemon Squeezy checkout.
      </p>
    )
  },
  {
    question: 'I purchased a product, but I can\'t find it in My Products.',
    answer: (
      <p>
        Check that you are signed in to the FarmVerb account used when checkout started. If you cannot
        remember that account or still need help, email{' '}
        <a href="mailto:support@farmverb.com">support@farmverb.com</a>.
      </p>
    )
  },
  {
    question: 'Where can I download my products?',
    answer: (
      <p>
        Go to My Account → My Products to find your installers, manuals, and license details.
      </p>
    )
  },
  {
    question: 'Can I use a different email for payment?',
    answer: (
      <p>
        Yes. Lemon Squeezy sends the receipt to your payment email, while product access remains linked to
        the FarmVerb account used to start checkout.
      </p>
    )
  }
] as const;

export default function PurchaseFaqAccordion() {
  const [openItems, setOpenItems] = useState<Set<number>>(() => new Set());

  const toggleItem = (index: number) => {
    setOpenItems((currentItems) => {
      const nextItems = new Set(currentItems);
      if (nextItems.has(index)) {
        nextItems.delete(index);
      } else {
        nextItems.add(index);
      }
      return nextItems;
    });
  };

  return (
    <div className="purchase-faq-list">
      {PURCHASE_FAQ_ITEMS.map((item, index) => {
        const isOpen = openItems.has(index);
        const triggerId = `purchase-faq-trigger-${index}`;
        const panelId = `purchase-faq-panel-${index}`;

        return (
          <section key={item.question} className={`purchase-faq-item ${isOpen ? 'is-open' : ''}`}>
            <h2>
              <button
                id={triggerId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggleItem(index)}
              >
                <span>{item.question}</span>
                <span className="purchase-faq-icon" aria-hidden="true">
                  {isOpen ? '−' : '+'}
                </span>
              </button>
            </h2>
            <div
              id={panelId}
              className="purchase-faq-panel"
              role="region"
              aria-labelledby={triggerId}
              hidden={!isOpen}
            >
              {item.answer}
            </div>
          </section>
        );
      })}
    </div>
  );
}
