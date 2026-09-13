'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

type MyProductsAccordionProps = {
  sectionId: string;
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
};

export default function MyProductsAccordion({
  sectionId,
  title,
  count,
  defaultOpen = false,
  children
}: MyProductsAccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const triggerId = `${sectionId}-trigger`;
  const contentId = `${sectionId}-content`;

  return (
    <section className={`mypage-entitlement-accordion ${isOpen ? 'is-open' : ''}`}>
      <h4 className="mypage-entitlement-heading">
        <button
          type="button"
          id={triggerId}
          className="mypage-entitlement-trigger"
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="mypage-entitlement-trigger-label">{title}</span>
          {typeof count === 'number' ? (
            <span className="mypage-entitlement-count">{count}</span>
          ) : null}
          <span className="mypage-entitlement-chevron" aria-hidden="true">
            <svg viewBox="0 0 20 20" focusable="false">
              <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
            </svg>
          </span>
        </button>
      </h4>
      <div
        id={contentId}
        className="mypage-entitlement-content"
        role="region"
        aria-labelledby={triggerId}
        aria-hidden={!isOpen}
        inert={!isOpen}
      >
        <div className="mypage-entitlement-content-inner">{children}</div>
      </div>
    </section>
  );
}
