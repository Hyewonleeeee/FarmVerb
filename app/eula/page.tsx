import type { Metadata } from 'next';
import LegalDocumentPage from '@/components/farmverb/LegalDocumentPage';

export const metadata: Metadata = {
  title: 'FarmVerb Software End User License Agreement (EULA) | FarmVerb',
  description:
    'Master End User License Agreement for FarmVerb software products, sample packs, and future releases.'
};

const toc = [
  { id: 'introduction', label: 'Introduction' },
  { id: 'grant-of-license', label: 'Grant of License' },
  { id: 'permitted-use', label: 'Permitted Use' },
  { id: 'restrictions', label: 'Restrictions' },
  { id: 'ownership', label: 'Ownership and Copyright' },
  { id: 'activation', label: 'License Activation' },
  { id: 'updates', label: 'Updates and Upgrades' },
  { id: 'warranties', label: 'Disclaimer of Warranties' },
  { id: 'liability', label: 'Limitation of Liability' },
  { id: 'termination', label: 'Termination' },
  { id: 'governing-law', label: 'Governing Law' },
  { id: 'contact', label: 'Contact Information' }
] as const;

export default function EulaPage() {
  return (
    <LegalDocumentPage
      title="FarmVerb Software End User License Agreement (EULA)"
      lastUpdated="June 8, 2026"
      toc={toc}
      footerLines={['support@farmverb.com', 'farmverb.com']}
    >
      <section id="introduction" className="legal-section">
        <h2>1. Introduction</h2>
        <p>
          This FarmVerb Software End User License Agreement (the &ldquo;Agreement&rdquo;) governs your access to and
          use of FarmVerb software products, including current and future Nebula Series plugins, Organic Series
          plugins, sample packs, and any other FarmVerb software products or related digital content made available to
          you.
        </p>
        <p>
          By installing, activating, downloading, accessing, or using any FarmVerb product, you agree to be bound by
          this Agreement. If you do not agree, do not install or use the product.
        </p>
      </section>

      <section id="grant-of-license" className="legal-section">
        <h2>2. Grant of License</h2>
        <p>
          Subject to your compliance with this Agreement, FarmVerb grants you a limited, non-exclusive,
          non-transferable, and revocable license to use the FarmVerb products you have lawfully obtained for your own
          music, sound design, and media production work.
        </p>
        <p>
          This license applies to the product files, presets, sample content, documentation, and any related digital
          materials supplied by FarmVerb, except where a separate written license states otherwise.
        </p>
      </section>

      <section id="permitted-use" className="legal-section">
        <h2>3. Permitted Use</h2>
        <p>You may use FarmVerb products in personal or commercial projects, including:</p>
        <ul>
          <li>Original music releases</li>
          <li>Client work and commissioned productions</li>
          <li>Film, television, broadcast, and online media</li>
          <li>Game audio and interactive media</li>
          <li>Live performance and other creative productions</li>
        </ul>
        <p>
          You may store, install, and access the products on devices or systems that you reasonably use for your
          production workflow, subject to any activation, account, or access policies that FarmVerb may set or update
          from time to time.
        </p>
      </section>

      <section id="restrictions" className="legal-section">
        <h2>4. Restrictions</h2>
        <p>You may not, and may not permit any third party to:</p>
        <ul>
          <li>Resell, sublicense, rent, lease, lend, or distribute the product files as standalone assets</li>
          <li>Share license keys, download links, activation data, or account access with others</li>
          <li>Reverse engineer, decompile, disassemble, or attempt to discover source code or hidden logic</li>
          <li>Remove, obscure, or alter FarmVerb copyright, branding, or ownership notices</li>
          <li>Use the products in any unlawful manner or in violation of applicable law</li>
          <li>Claim ownership of the underlying content or redistribute the raw files as your own library</li>
        </ul>
      </section>

      <section id="ownership" className="legal-section">
        <h2>5. Ownership and Copyright</h2>
        <p>
          FarmVerb and its licensors retain all right, title, and interest in and to the products, including all
          associated audio content, visual assets, design elements, trademarks, and intellectual property rights.
        </p>
        <p>
          This Agreement grants you a license to use the products; it does not transfer ownership to you. Any rights not
          expressly granted to you remain with FarmVerb.
        </p>
      </section>

      <section id="activation" className="legal-section">
        <h2>6. License Activation</h2>
        <p>
          Certain products may require activation, account verification, or other access controls before use. FarmVerb
          may use flexible activation, download, or access policies that are appropriate for the product, the license
          type, or your account status.
        </p>
        <p>
          Activation policies may change over time to support product reliability, security, anti-abuse measures, or
          future distribution needs.
        </p>
      </section>

      <section id="updates" className="legal-section">
        <h2>7. Updates and Upgrades</h2>
        <p>
          FarmVerb may provide updates, improvements, bug fixes, new versions, or upgrades for its products. Any such
          updates are governed by this Agreement unless FarmVerb states otherwise in writing.
        </p>
        <p>
          Access to updates or upgrades may depend on the product, the purchase channel, the license type, or your
          account status at the time the update is made available.
        </p>
      </section>

      <section id="warranties" className="legal-section">
        <h2>8. Disclaimer of Warranties</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE FARMVERB PRODUCTS ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
          AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY.
        </p>
        <p>
          FarmVerb disclaims all warranties, including but not limited to implied warranties of merchantability,
          fitness for a particular purpose, non-infringement, and uninterrupted or error-free operation.
        </p>
      </section>

      <section id="liability" className="legal-section">
        <h2>9. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, FARMVERB WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
          CONSEQUENTIAL, SPECIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, DATA, BUSINESS, OR GOODWILL
          ARISING OUT OF OR RELATED TO THE USE OF THE PRODUCTS.
        </p>
        <p>
          FARMVERB&apos;S TOTAL LIABILITY FOR ANY CLAIM ARISING FROM OR RELATED TO THE PRODUCTS SHALL NOT EXCEED THE
          AMOUNT YOU PAID FOR THE SPECIFIC PRODUCT GIVING RISE TO THE CLAIM, UNLESS APPLICABLE LAW REQUIRES OTHERWISE.
        </p>
      </section>

      <section id="termination" className="legal-section">
        <h2>10. Termination</h2>
        <p>
          This Agreement remains in effect until terminated. FarmVerb may suspend or terminate your license if you fail
          to comply with this Agreement, if your access is abused or compromised, or if termination is otherwise
          required by law or policy.
        </p>
        <p>
          Upon termination, you must stop using the product and delete or remove any copies of the product files that
          are no longer authorized for your use, except where retention is required by law.
        </p>
      </section>

      <section id="governing-law" className="legal-section">
        <h2>11. Governing Law</h2>
        <p>
          This Agreement and any dispute arising from or related to it will be governed by the laws of the Republic of
          Korea, without regard to conflict-of-law principles, unless mandatory local law requires otherwise.
        </p>
        <p>
          Any dispute that cannot be resolved informally may be brought in a court of competent jurisdiction in the
          applicable venue under governing law.
        </p>
      </section>

      <section id="contact" className="legal-section">
        <h2>12. Contact Information</h2>
        <p>If you have questions about this Agreement or any FarmVerb product, please contact us at:</p>
        <ul>
          <li>
            Email: <a href="mailto:support@farmverb.com">support@farmverb.com</a>
          </li>
          <li>
            Website: <a href="https://farmverb.com">farmverb.com</a>
          </li>
        </ul>
      </section>
    </LegalDocumentPage>
  );
}
