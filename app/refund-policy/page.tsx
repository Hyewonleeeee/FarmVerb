import type { Metadata } from 'next';
import LegalDocumentPage from '@/components/farmverb/LegalDocumentPage';

export const metadata: Metadata = {
  title: 'FarmVerb Refund Policy | FarmVerb',
  description: 'Refund request and review policy for FarmVerb downloadable digital products.'
};

const toc = [
  { id: 'scope', label: 'Scope' },
  { id: 'requests', label: 'How to Request a Refund' },
  { id: 'review', label: 'Individual Review' },
  { id: 'digital-products', label: 'Downloadable Digital Products' },
  { id: 'eligible-circumstances', label: 'When a Refund May Be Considered' },
  { id: 'generally-not-provided', label: 'When Refunds Are Generally Not Provided' },
  { id: 'bundles', label: 'Bundles' },
  { id: 'approved-refunds', label: 'Approved Refunds and License Access' },
  { id: 'consumer-rights', label: 'Consumer Rights' },
  { id: 'contact', label: 'Contact' }
] as const;

export default function RefundPolicyPage() {
  return (
    <LegalDocumentPage
      title="FarmVerb Refund Policy"
      lastUpdated="September 14, 2026"
      toc={toc}
      footerLines={['support@farmverb.com', 'farmverb.com']}
    >
      <section id="scope" className="legal-section">
        <h2>1. Scope</h2>
        <p>
          This Refund Policy applies to FarmVerb downloadable digital products, including audio plugins, software
          instruments, sample packs, bundles, and related digital content.
        </p>
      </section>

      <section id="requests" className="legal-section">
        <h2>2. How to Request a Refund</h2>
        <p>
          Refund requests must be submitted to{' '}
          <a href="mailto:support@farmverb.com">support@farmverb.com</a>. To help us review your request, please
          include, where available, the order email, order number, product name, operating system, DAW, and a clear
          description of the issue.
        </p>
        <p>
          FarmVerb does not provide an automatic refund button. Submitting a request does not approve or initiate a
          refund.
        </p>
      </section>

      <section id="review" className="legal-section">
        <h2>3. Individual Review</h2>
        <p>
          Each request is reviewed individually. If FarmVerb approves a refund, it will be issued through Lemon
          Squeezy. A refund is complete only after it has been processed by Lemon Squeezy.
        </p>
      </section>

      <section id="digital-products" className="legal-section">
        <h2>4. Downloadable Digital Products</h2>
        <p>
          Because FarmVerb products are delivered as downloadable digital content, change-of-mind refunds are
          generally not provided once product files have been downloaded or a license key has been activated, except
          where required by applicable law.
        </p>
      </section>

      <section id="eligible-circumstances" className="legal-section">
        <h2>5. When a Refund May Be Considered</h2>
        <p>A refund may be considered in circumstances including:</p>
        <ul>
          <li>A duplicate purchase</li>
          <li>An unauthorized transaction</li>
          <li>
            A verified material technical defect that prevents the product from operating in a published supported
            environment and cannot be resolved after reasonable troubleshooting
          </li>
          <li>A product that materially differs from its published description</li>
          <li>A circumstance in which applicable consumer law requires a refund</li>
        </ul>
      </section>

      <section id="generally-not-provided" className="legal-section">
        <h2>6. When Refunds Are Generally Not Provided</h2>
        <p>Subject to applicable consumer law, refunds are generally not provided for:</p>
        <ul>
          <li>Change of mind after download or license activation</li>
          <li>Subjective preferences regarding sound, workflow, or features</li>
          <li>
            Incompatibility with an operating system, DAW, plugin format, or hardware that was clearly identified as
            unsupported before purchase
          </li>
          <li>Failure to review the published system requirements before purchase</li>
        </ul>
      </section>

      <section id="bundles" className="legal-section">
        <h2>7. Bundles</h2>
        <p>
          A bundle is treated as one digital product. Use of only part of a bundle does not guarantee a partial refund.
          This does not affect any remedy required by applicable law.
        </p>
      </section>

      <section id="approved-refunds" className="legal-section">
        <h2>8. Approved Refunds and License Access</h2>
        <p>
          When a full refund has been completed by Lemon Squeezy, license keys associated with the refunded order will
          be disabled and FarmVerb account access to the refunded product will end. A partial refund does not
          automatically disable the associated license keys.
        </p>
      </section>

      <section id="consumer-rights" className="legal-section">
        <h2>9. Consumer Rights</h2>
        <p>
          Nothing in this policy limits any rights that cannot be excluded under applicable consumer law.
        </p>
      </section>

      <section id="contact" className="legal-section">
        <h2>10. Contact</h2>
        <p>
          Refund questions and requests should be sent to{' '}
          <a href="mailto:support@farmverb.com">support@farmverb.com</a>.
        </p>
      </section>
    </LegalDocumentPage>
  );
}
