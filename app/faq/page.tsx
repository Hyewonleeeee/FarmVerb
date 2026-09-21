import type { Metadata } from 'next';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import GlobalFooter from '@/components/farmverb/GlobalFooter';
import PurchaseFaqAccordion from '@/components/farmverb/PurchaseFaqAccordion';

export const metadata: Metadata = {
  title: 'Purchase & Account FAQ | FarmVerb',
  description: 'Answers about FarmVerb purchase accounts, downloads, payment emails, and product access.'
};

export default function FaqPage() {
  return (
    <div className="auth-page-shell faq-page-shell">
      <AuthPageHeader />

      <main className="faq-page-main">
        <header className="faq-page-hero">
          <p className="auth-overline">Support</p>
          <h1>Purchase &amp; Account FAQ</h1>
          <p>Quick answers about purchase access, account linking, and downloads.</p>
        </header>

        <PurchaseFaqAccordion />

        <aside className="faq-contact-card" aria-labelledby="faq-contact-title">
          <div>
            <h2 id="faq-contact-title">Still need help?</h2>
            <p>We can help you locate a purchase and verify the account it belongs to.</p>
          </div>
          <a href="mailto:support@farmverb.com" className="auth-submit auth-submit-secondary">
            Contact Support
          </a>
        </aside>
      </main>

      <div className="faq-page-footer site-container">
        <GlobalFooter />
      </div>
    </div>
  );
}
