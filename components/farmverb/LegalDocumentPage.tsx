import Link from 'next/link';
import type { ReactNode } from 'react';

type TocItem = {
  id: string;
  label: string;
};

type LegalDocumentPageProps = {
  title: string;
  lastUpdated: string;
  toc: readonly TocItem[];
  footerLines: string[];
  children: ReactNode;
};

export default function LegalDocumentPage({ title, lastUpdated, toc, footerLines, children }: LegalDocumentPageProps) {
  return (
    <main className="legal-page">
      <div className="legal-page-shell site-container">
        <header className="legal-page-topbar" aria-label="FarmVerb legal page header">
          <Link href="/" className="legal-page-brand">
            FARMVERB
          </Link>
          <Link href="/support" className="legal-page-support">
            Support
          </Link>
        </header>

        <section className="legal-hero">
          <p className="section-overline">Legal</p>
          <h1 className="page-title legal-page-title">{title}</h1>
          <p className="legal-page-updated">Last Updated: {lastUpdated}</p>
        </section>

        <div className="legal-page-layout">
          <aside className="legal-page-toc" aria-label="Table of contents">
            <p className="legal-page-toc-label">Table of Contents</p>
            <nav className="legal-page-toc-links">
              {toc.map((item) => (
                <a key={item.id} href={`#${item.id}`}>
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>

          <article className="legal-page-article">{children}</article>
        </div>

        <footer className="legal-page-footer">
          <p className="legal-page-footer-brand">FarmVerb</p>
          <div className="legal-page-footer-lines">
            {footerLines.map((line) => (
              <p key={line} className="legal-page-footer-line">
                {line}
              </p>
            ))}
          </div>
          <p className="legal-page-footer-copyright">© 2026 FarmVerb. All rights reserved.</p>
        </footer>
      </div>
    </main>
  );
}
