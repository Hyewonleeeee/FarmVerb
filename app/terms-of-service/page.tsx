import type { Metadata } from 'next';
import LegalDocumentPage from '@/components/farmverb/LegalDocumentPage';

export const metadata: Metadata = {
  title: 'FarmVerb Terms of Service | FarmVerb',
  description: 'Terms of Service for FarmVerb website and products.'
};

const toc = [
  { id: 'agreement', label: 'Agreement' },
  { id: 'eligibility', label: 'Eligibility and Accounts' },
  { id: 'acceptable-use', label: 'Acceptable Use' },
  { id: 'purchases', label: 'Purchases and Downloads' },
  { id: 'ip', label: 'Intellectual Property' },
  { id: 'disclaimer', label: 'Disclaimer and Liability' },
  { id: 'termination', label: 'Termination' },
  { id: 'law', label: 'Governing Law' },
  { id: 'contact', label: 'Contact Information' }
] as const;

export default function TermsOfServicePage() {
  return (
    <LegalDocumentPage
      title="FarmVerb Terms of Service"
      lastUpdated="June 8, 2026"
      toc={toc}
      footerLines={['support@farmverb.com', 'farmverb.com']}
    >
      <section id="agreement" className="legal-section">
        <h2>1. Agreement</h2>
        <p>
          These Terms of Service govern your access to and use of the FarmVerb website, stores, products, downloads,
          and related services.
        </p>
      </section>

      <section id="eligibility" className="legal-section">
        <h2>2. Eligibility and Accounts</h2>
        <p>
          You are responsible for maintaining accurate account information and for safeguarding your account
          credentials. You must be authorized to use the services in your jurisdiction.
        </p>
      </section>

      <section id="acceptable-use" className="legal-section">
        <h2>3. Acceptable Use</h2>
        <p>
          You agree not to misuse the website or services, interfere with security or access controls, violate laws, or
          attempt unauthorized access to accounts, downloads, or product systems.
        </p>
      </section>

      <section id="purchases" className="legal-section">
        <h2>4. Purchases and Downloads</h2>
        <p>
          Purchases, downloads, license issuance, and access conditions may be governed by product-specific details or
          policies presented at the time of purchase. FarmVerb may update operational rules as needed for reliability
          and security.
        </p>
      </section>

      <section id="ip" className="legal-section">
        <h2>5. Intellectual Property</h2>
        <p>
          All products, product pages, downloads, and website materials remain the property of FarmVerb or its
          licensors and are protected by intellectual property laws.
        </p>
      </section>

      <section id="disclaimer" className="legal-section">
        <h2>6. Disclaimer and Liability</h2>
        <p>
          The services are provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. To the maximum
          extent permitted by law, FarmVerb limits liability for claims arising from your use of the website or
          services.
        </p>
      </section>

      <section id="termination" className="legal-section">
        <h2>7. Termination</h2>
        <p>
          FarmVerb may suspend or terminate access if you violate these Terms, misuse the services, or if necessary to
          protect users, products, or infrastructure.
        </p>
      </section>

      <section id="law" className="legal-section">
        <h2>8. Governing Law</h2>
        <p>
          These Terms are governed by the laws of the Republic of Korea, unless mandatory local law requires
          otherwise.
        </p>
      </section>

      <section id="contact" className="legal-section">
        <h2>9. Contact Information</h2>
        <p>
          Questions about these Terms can be sent to <a href="mailto:support@farmverb.com">support@farmverb.com</a> or
          via <a href="https://farmverb.com">farmverb.com</a>.
        </p>
      </section>
    </LegalDocumentPage>
  );
}
