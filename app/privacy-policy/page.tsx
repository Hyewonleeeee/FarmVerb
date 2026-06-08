import type { Metadata } from 'next';
import LegalDocumentPage from '@/components/farmverb/LegalDocumentPage';

export const metadata: Metadata = {
  title: 'FarmVerb Privacy Policy | FarmVerb',
  description: 'Privacy Policy for FarmVerb products and website services.'
};

const toc = [
  { id: 'introduction', label: 'Introduction' },
  { id: 'information-we-collect', label: 'Information We Collect' },
  { id: 'how-we-use-information', label: 'How We Use Information' },
  { id: 'sharing', label: 'Sharing and Disclosure' },
  { id: 'retention', label: 'Data Retention' },
  { id: 'security', label: 'Security' },
  { id: 'your-rights', label: 'Your Rights' },
  { id: 'contact', label: 'Contact Information' }
] as const;

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentPage
      title="FarmVerb Privacy Policy"
      lastUpdated="June 8, 2026"
      toc={toc}
      footerLines={['support@farmverb.com', 'farmverb.com']}
    >
      <section id="introduction" className="legal-section">
        <h2>1. Introduction</h2>
        <p>
          This Privacy Policy explains how FarmVerb collects, uses, discloses, and protects information when you use
          our website, accounts, downloads, and related services.
        </p>
      </section>

      <section id="information-we-collect" className="legal-section">
        <h2>2. Information We Collect</h2>
        <p>
          We may collect information you provide directly, such as your name, email address, account details, order
          information, and support requests. We may also collect limited technical information such as device or
          browser data, usage logs, and basic analytics.
        </p>
      </section>

      <section id="how-we-use-information" className="legal-section">
        <h2>3. How We Use Information</h2>
        <p>
          FarmVerb uses information to operate the website, process orders, issue licenses, provide downloads, send
          account or product updates, respond to support requests, and improve the user experience.
        </p>
      </section>

      <section id="sharing" className="legal-section">
        <h2>4. Sharing and Disclosure</h2>
        <p>
          We do not sell personal information. We may share limited information with service providers that help us run
          the website, fulfill orders, deliver email, support account functionality, or comply with legal obligations.
        </p>
      </section>

      <section id="retention" className="legal-section">
        <h2>5. Data Retention</h2>
        <p>
          We retain information only as long as needed for the purposes described in this Policy, unless a longer
          retention period is required or permitted by law.
        </p>
      </section>

      <section id="security" className="legal-section">
        <h2>6. Security</h2>
        <p>
          FarmVerb uses reasonable administrative, technical, and organizational safeguards designed to protect
          information, but no method of transmission or storage is completely secure.
        </p>
      </section>

      <section id="your-rights" className="legal-section">
        <h2>7. Your Rights</h2>
        <p>
          Depending on your location and applicable law, you may have rights to access, correct, delete, or limit the
          use of your personal information. If you would like to make a request, contact us using the details below.
        </p>
      </section>

      <section id="contact" className="legal-section">
        <h2>8. Contact Information</h2>
        <p>
          Questions about privacy can be sent to <a href="mailto:support@farmverb.com">support@farmverb.com</a> or
          via <a href="https://farmverb.com">farmverb.com</a>.
        </p>
      </section>
    </LegalDocumentPage>
  );
}
