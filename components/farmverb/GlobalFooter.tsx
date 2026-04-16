export default function GlobalFooter() {
  return (
    <footer className="global-footer" aria-label="FarmVerb site footer">
      <div className="footer-grid">
        <div className="footer-brand-block">
          <p className="footer-brand">FARMVERB</p>
          <p className="footer-brand-line">Organic sonic tools with character and depth.</p>
          <p className="footer-copyright">© 2026 FarmVerb. All rights reserved.</p>
        </div>

        <div className="footer-columns">
          <section className="footer-column" aria-label="Products links">
            <h2>Products</h2>
            <a href="#/instrument" data-route="instrument">
              Software Instrument
            </a>
            <a href="#/plugins" data-route="plugins">
              Audio Plugins
            </a>
            <a href="#/sample-pack" data-route="sample-pack">
              Sample Pack
            </a>
          </section>

          <section className="footer-column" aria-label="Support links">
            <h2>Support</h2>
            <a href="#/support" data-route="support">
              Support
            </a>
            <a href="mailto:support@farmverb.com?subject=FarmVerb%20FAQ">FAQ</a>
          </section>

          <section className="footer-column" aria-label="Social links">
            <h2>Social</h2>
            <a href="https://www.instagram.com/farmverb/" target="_blank" rel="noopener noreferrer">
              Instagram
            </a>
            <a href="https://www.youtube.com/@farmverb" target="_blank" rel="noopener noreferrer">
              YouTube
            </a>
          </section>

          <section className="footer-column" aria-label="Contact links">
            <h2>Contact</h2>
            <a href="mailto:support@farmverb.com">Email</a>
            <a href="mailto:support@farmverb.com">support@farmverb.com</a>
          </section>
        </div>
      </div>
    </footer>
  );
}
