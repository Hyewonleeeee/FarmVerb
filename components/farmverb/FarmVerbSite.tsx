'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AuthNav from '@/components/auth/AuthNav';
import GlobalFooter from '@/components/farmverb/GlobalFooter';
import { initFarmVerbSite } from '@/lib/ui/initFarmVerbSite';

type PluginSeriesKey = 'nebula' | 'organic';
type NebulaProductTabKey = 'all' | 'Nebula Crush' | 'Nebula Space' | 'Nebula Warp' | 'Nebula Rift';
type OrganicProductTabKey = 'all' | 'Germinate' | 'Jeju Citrus' | 'Boseong Green Tea';

type PluginProduct = {
  name: string;
  description: string;
  images?: string[];
  unavailable?: boolean;
};

type CartItem = {
  name: string;
  quantity: number;
};

const NEBULA_PRODUCT_TABS: NebulaProductTabKey[] = ['all', 'Nebula Crush', 'Nebula Space', 'Nebula Warp', 'Nebula Rift'];
const ORGANIC_PRODUCT_TABS: OrganicProductTabKey[] = ['all', 'Germinate', 'Jeju Citrus', 'Boseong Green Tea'];

const PLUGIN_SERIES: Record<
  PluginSeriesKey,
  {
    title: string;
    description: string;
    products: PluginProduct[];
  }
> = {
  nebula: {
    title: 'Nebula Series',
    description: 'Four devices tuned for weight, movement, and dimension.',
    products: [
      {
        name: 'Nebula Crush',
        description: 'Energy-driven harmonic pressure with animated contour and modern punch.',
        images: ['/Nebula%20Series/Crush/Nebula%20Crush.png', '/Nebula%20Series/Crush/Nebula%20Crush02.png']
      },
      {
        name: 'Nebula Space',
        description: 'A deep atmospheric field for cinematic distance and blooming tails.',
        images: ['/Nebula%20Series/Space/Nebula%20Space.png', '/Nebula%20Series/Space/Nebula%20Space02.png']
      },
      {
        name: 'Nebula Warp',
        description: 'Elastic modulation for unstable drift, fluid movement, and stereo animation.',
        unavailable: true
      },
      {
        name: 'Nebula Rift',
        description: 'Fragment-based texture design with controlled digital tension and rhythmic bite.',
        unavailable: true
      }
    ]
  },
  organic: {
    title: 'Organic Series',
    description: 'Warm movement inspired by natural growth and breathable dynamics.',
    products: [
      {
        name: 'Germinate',
        description: 'Granular delay that blooms over time with gentle unpredictability and tactile rhythm.',
        images: ['/Germinate/Germinate.png', '/Germinate/Germinate02.png']
      },
      {
        name: 'Jeju Citrus',
        description: 'A citrus-toned organic processor slot, reserved for future release.',
        unavailable: true
      },
      {
        name: 'Boseong Green Tea',
        description: 'A breathable texture processor slot, reserved for future release.',
        unavailable: true
      }
    ]
  }
};

export default function FarmVerbSite() {
  const [activePluginSeries, setActivePluginSeries] = useState<PluginSeriesKey>('nebula');
  const [activeNebulaProductTab, setActiveNebulaProductTab] = useState<NebulaProductTabKey>('all');
  const [activeOrganicProductTab, setActiveOrganicProductTab] = useState<OrganicProductTabKey>('all');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [buyNowNotice, setBuyNowNotice] = useState<string | null>(null);
  const cartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return initFarmVerbSite();
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!cartRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !cartRef.current.contains(target)) {
        setIsCartOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    if (!buyNowNotice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setBuyNowNotice(null);
    }, 2200);

    return () => window.clearTimeout(timeoutId);
  }, [buyNowNotice]);

  const activeSeries = useMemo(() => PLUGIN_SERIES[activePluginSeries], [activePluginSeries]);
  const visibleProducts = useMemo(() => {
    if (activePluginSeries === 'nebula') {
      if (activeNebulaProductTab === 'all') {
        return activeSeries.products;
      }
      return activeSeries.products.filter((product) => product.name === activeNebulaProductTab);
    }

    if (activePluginSeries === 'organic') {
      if (activeOrganicProductTab === 'all') {
        return activeSeries.products;
      }
      return activeSeries.products.filter((product) => product.name === activeOrganicProductTab);
    }

    return activeSeries.products;
  }, [activeNebulaProductTab, activeOrganicProductTab, activePluginSeries, activeSeries.products]);

  const selectedSeriesProduct = useMemo(() => {
    if (activePluginSeries === 'nebula' && activeNebulaProductTab !== 'all') {
      return activeSeries.products.find((product) => product.name === activeNebulaProductTab) ?? null;
    }

    if (activePluginSeries === 'organic' && activeOrganicProductTab !== 'all') {
      return activeSeries.products.find((product) => product.name === activeOrganicProductTab) ?? null;
    }

    return null;
  }, [activeNebulaProductTab, activeOrganicProductTab, activePluginSeries, activeSeries.products]);

  const showSeriesFeature = Boolean(selectedSeriesProduct);

  const currentSubtabs = activePluginSeries === 'nebula' ? NEBULA_PRODUCT_TABS : ORGANIC_PRODUCT_TABS;
  const activeSubtab = activePluginSeries === 'nebula' ? activeNebulaProductTab : activeOrganicProductTab;
  const onSubtabClick = (tabKey: NebulaProductTabKey | OrganicProductTabKey) => {
    if (activePluginSeries === 'nebula') {
      setActiveNebulaProductTab(tabKey as NebulaProductTabKey);
      return;
    }

    setActiveOrganicProductTab(tabKey as OrganicProductTabKey);
  };

  const onSeriesTabClick = (series: PluginSeriesKey) => {
    setActivePluginSeries(series);
  };

  const subtabAriaLabel = activePluginSeries === 'nebula' ? 'Nebula products' : 'Organic products';

  const renderSubtabs = () => (
    <div className="plugin-subtabs" role="tablist" aria-label={subtabAriaLabel}>
      {currentSubtabs.map((tabKey) => (
        <button
          key={tabKey}
          type="button"
          role="tab"
          aria-selected={activeSubtab === tabKey}
          className={`plugin-subtab ${activeSubtab === tabKey ? 'is-active' : ''}`}
          onClick={() => onSubtabClick(tabKey)}
        >
          {tabKey === 'all' ? 'All' : tabKey}
        </button>
      ))}
    </div>
  );

  const renderSeriesFeature = () => {
    if (!showSeriesFeature || !selectedSeriesProduct) {
      return null;
    }

    return (
      <section className={`plugin-feature-stage plugin-feature-${activePluginSeries} interactive-tilt`} aria-label={`${selectedSeriesProduct.name} detail`}>
        {selectedSeriesProduct.images && selectedSeriesProduct.images.length > 0 ? (
          <figure className={`plugin-feature-media ${selectedSeriesProduct.images.length > 1 ? 'plugin-feature-gallery' : ''}`}>
            {selectedSeriesProduct.images.length > 1 ? (
              <div className="plugin-feature-gallery-track">
                {selectedSeriesProduct.images.map((src, index) => (
                  <div key={`${selectedSeriesProduct.name}-${src}`} className="plugin-feature-slide">
                    <img src={src} alt={`${selectedSeriesProduct.name} interface view ${index + 1}`} />
                  </div>
                ))}
              </div>
            ) : (
              <img src={selectedSeriesProduct.images[0]} alt={`${selectedSeriesProduct.name} interface`} />
            )}
          </figure>
        ) : (
          <div className="plugin-feature-media is-empty">
            <span>Image Coming Soon</span>
          </div>
        )}

        <div className="plugin-feature-copy">
          <h3>{selectedSeriesProduct.name}</h3>
          <p>{selectedSeriesProduct.description}</p>
          {selectedSeriesProduct.unavailable ? <p className="plugin-card-status">Coming Soon</p> : null}
          <div className="plugin-feature-actions">
            <button
              type="button"
              className="plugin-action plugin-action-cart"
              disabled={selectedSeriesProduct.unavailable}
              onClick={() => addToCart(selectedSeriesProduct.name)}
            >
              Add to Cart
            </button>
            <button
              type="button"
              className="plugin-action plugin-action-buy"
              disabled={selectedSeriesProduct.unavailable}
              onClick={() => onBuyNow(selectedSeriesProduct.name)}
            >
              Buy Now
            </button>
          </div>
        </div>
      </section>
    );
  };

  const renderSeriesGrid = () => (
    <div className={`plugin-grid plugin-grid-${activePluginSeries}`} role="list" aria-label={`${activeSeries.title} products`}>
      {visibleProducts.map((product) => (
        <article
          key={product.name}
          className={`plugin-card plugin-card-${activePluginSeries} interactive-tilt ${product.unavailable ? 'is-unavailable' : ''}`}
          role="listitem"
          tabIndex={0}
        >
          {product.images && product.images.length > 0 ? (
            <figure className="plugin-card-media">
              <img src={product.images[0]} alt={`${product.name} interface`} />
            </figure>
          ) : (
            <div className="plugin-card-media is-empty">
              <span>Image Coming Soon</span>
            </div>
          )}

          <div className="plugin-card-copy">
            <h3>{product.name}</h3>
            <p>{product.description}</p>
            {product.unavailable ? <p className="plugin-card-status">Coming Soon</p> : null}
          </div>

          <div className="plugin-card-actions">
            <button
              type="button"
              className="plugin-action plugin-action-cart"
              disabled={product.unavailable}
              onClick={() => addToCart(product.name)}
            >
              Add to Cart
            </button>
            <button
              type="button"
              className="plugin-action plugin-action-buy"
              disabled={product.unavailable}
              onClick={() => onBuyNow(product.name)}
            >
              Buy Now
            </button>
          </div>
        </article>
      ))}
    </div>
  );

  const renderSeriesContent = () => {
    if (showSeriesFeature) {
      return renderSeriesFeature();
    }

    return renderSeriesGrid();
  };

  const cartItemCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  );

  const addToCart = (productName: string) => {
    setCartItems((prev) => {
      const exists = prev.find((item) => item.name === productName);
      if (!exists) {
        return [...prev, { name: productName, quantity: 1 }];
      }

      return prev.map((item) =>
        item.name === productName ? { ...item, quantity: item.quantity + 1 } : item
      );
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (productName: string) => {
    setCartItems((prev) => prev.filter((item) => item.name !== productName));
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const onBuyNow = (productName: string) => {
    setBuyNowNotice(`${productName} checkout is coming soon.`);
  };

  return (
    <div className="farmverb-root">
      <div className="grain-layer" aria-hidden="true" />

      <header className="site-header">
        <nav className="site-nav" aria-label="Primary navigation">
          <div className="nav-group nav-left">
            <a href="#/instrument" className="nav-link" data-route="instrument">
              Software Instrument
            </a>
            <a href="#/plugins" className="nav-link" data-route="plugins">
              Audio Plugins
            </a>
            <a href="#/sample-pack" className="nav-link" data-route="sample-pack">
              Sample Pack
            </a>
          </div>

          <a href="#/" className="brand" data-route="home" aria-label="FarmVerb home">
            FARMVERB
          </a>

          <div className="nav-group nav-right">
            <a href="#/support" className="nav-link nav-link-support" data-route="support">
              Support
            </a>
            <div className={`cart-shell ${isCartOpen ? 'is-open' : ''}`} ref={cartRef}>
              <button
                type="button"
                className="cart-trigger"
                aria-label={`Shopping cart, ${cartItemCount} item${cartItemCount === 1 ? '' : 's'}`}
                onClick={() => setIsCartOpen((prev) => !prev)}
              >
                <span className="cart-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M3 4h2l1.4 8.2a2 2 0 0 0 2 1.8h7.9a2 2 0 0 0 2-1.6L20 7H7.2" />
                    <circle cx="10" cy="19" r="1.7" />
                    <circle cx="17" cy="19" r="1.7" />
                  </svg>
                </span>
                <span className="cart-label">Cart</span>
                <span className="cart-badge">{cartItemCount}</span>
              </button>

              {isCartOpen ? (
                <div className="cart-dropdown" role="dialog" aria-label="Shopping cart">
                  <div className="cart-head">
                    <h2>Cart</h2>
                    {cartItems.length > 0 ? (
                      <button type="button" className="cart-clear" onClick={clearCart}>
                        Clear
                      </button>
                    ) : null}
                  </div>

                  {cartItems.length === 0 ? (
                    <p className="cart-empty">Your cart is empty.</p>
                  ) : (
                    <ul className="cart-list">
                      {cartItems.map((item) => (
                        <li key={item.name} className="cart-item">
                          <div className="cart-item-copy">
                            <strong>{item.name}</strong>
                            <span>Qty {item.quantity}</span>
                          </div>
                          <button
                            type="button"
                            className="cart-remove"
                            onClick={() => removeFromCart(item.name)}
                            aria-label={`Remove ${item.name} from cart`}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
            <AuthNav />
          </div>
        </nav>
      </header>

      <main className="experience" id="experience">
        <section className="page page-home is-active" data-page="home" aria-hidden="false">
          <canvas id="home-canvas" className="ambient-canvas" aria-hidden="true" />
          <div className="shape shape-a" aria-hidden="true" />
          <div className="shape shape-b" aria-hidden="true" />
          <div className="shape shape-c" aria-hidden="true" />

          <div className="crop-orchard" aria-hidden="true">
            <span className="crop-node crop-1 layer-front parallax-node" data-depth="5">
              <img src="/Main/blueberry.png" alt="" className="crop" />
            </span>
            <span className="crop-node crop-2 layer-front parallax-node" data-depth="6">
              <img src="/Main/Tomato.png" alt="" className="crop" />
            </span>
            <span className="crop-node crop-3 layer-mid parallax-node" data-depth="4">
              <img src="/Main/Rice.png" alt="" className="crop" />
            </span>
            <span className="crop-node crop-4 layer-front parallax-node" data-depth="5">
              <img src="/Main/Rice.png" alt="" className="crop" />
            </span>
            <span className="crop-node crop-5 layer-mid parallax-node" data-depth="4">
              <img src="/Main/peach.png" alt="" className="crop" />
            </span>
            <span className="crop-node crop-6 layer-mid parallax-node" data-depth="4">
              <img src="/Main/greenapple.png" alt="" className="crop" />
            </span>
            <span className="crop-node crop-7 layer-back parallax-node" data-depth="2">
              <img src="/Main/Rice2.png" alt="" className="crop" />
            </span>
            <span className="crop-node crop-8 layer-back parallax-node" data-depth="2">
              <img src="/Main/Tomato.png" alt="" className="crop" />
            </span>
            <span className="crop-node crop-9 layer-back parallax-node" data-depth="2">
              <img src="/Main/Sangchu.png" alt="" className="crop" />
            </span>
            <span className="crop-node crop-10 layer-mid parallax-node" data-depth="3">
              <img src="/Main/greenapple.png" alt="" className="crop" />
            </span>
            <span className="crop-node crop-11 layer-mid parallax-node" data-depth="3">
              <img src="/Main/peach.png" alt="" className="crop" />
            </span>
            <span className="crop-node crop-12 layer-back parallax-node" data-depth="2">
              <img src="/Main/Rice2.png" alt="" className="crop" />
            </span>
            <span className="crop-node crop-13 layer-back parallax-node" data-depth="2">
              <img src="/Main/Sangchu.png" alt="" className="crop" />
            </span>
          </div>

          <div className="fruit-orchard" aria-hidden="true">
            <span className="fruit-node fruit-1 layer-front parallax-node" data-depth="7">
              <img src="/Main/Lime.png" alt="" className="fruit fruit-lime" />
            </span>
            <span className="fruit-node fruit-2 layer-front parallax-node" data-depth="7">
              <img src="/Main/Lemon.png" alt="" className="fruit fruit-lemon" />
            </span>
          </div>

          <div className="page-scroll page-shell home-scroll">
            <div className="home-stage parallax-node" data-depth="16">
              <p className="section-overline">FarmVerb Sonic Atelier</p>
              <h1 className="hero-title">Grow Your Sound</h1>
              <p className="hero-copy">Organic tools for producers and sound designers</p>
              <a href="#/plugins" className="hero-link" data-route="plugins">
                Enter Audio Plugins
              </a>
            </div>

            <div className="global-footer-host">
              <GlobalFooter />
            </div>
          </div>
        </section>

        <section className="page page-plugins" data-page="plugins" aria-hidden="true">
          <div className="page-scroll page-shell">
            <section className="plugins-hero parallax-node" data-depth="10">
              <p className="section-overline">Audio Plugins</p>
              <h1 className="page-title">Signal Shaping for Living Space</h1>
              <p className="page-copy">
                FarmVerb plugins balance detailed texture and open-air depth, built for warm movement and character.
              </p>
            </section>

            <section className="plugin-tabs-wrap" aria-label="Plugin series tabs">
              <div className="plugin-tabs" role="tablist" aria-label="Plugin series">
                <button
                  id="plugin-tab-nebula"
                  type="button"
                  role="tab"
                  aria-selected={activePluginSeries === 'nebula'}
                  className={`plugin-tab ${activePluginSeries === 'nebula' ? 'is-active' : ''}`}
                  onClick={() => onSeriesTabClick('nebula')}
                >
                  Nebula Series
                </button>
                <button
                  id="plugin-tab-organic"
                  type="button"
                  role="tab"
                  aria-selected={activePluginSeries === 'organic'}
                  className={`plugin-tab ${activePluginSeries === 'organic' ? 'is-active' : ''}`}
                  onClick={() => onSeriesTabClick('organic')}
                >
                  Organic Series
                </button>
              </div>
            </section>

            <section className="plugin-series-view" role="tabpanel" aria-labelledby={`plugin-tab-${activePluginSeries}`}>
              <div className="title-block">
                <h2>{activeSeries.title}</h2>
                <p>{activeSeries.description}</p>
              </div>

              {renderSubtabs()}
              {renderSeriesContent()}
            </section>

            <div className="global-footer-host">
              <GlobalFooter />
            </div>
          </div>
        </section>

        <section className="page page-instrument" data-page="instrument" aria-hidden="true">
          <div className="page-scroll page-shell">
            <div className="instrument-layout">
              <div className="instrument-copy parallax-node" data-depth="12">
                <p className="section-overline">Software Instrument</p>
                <h1 className="page-title">Nebula Drums</h1>
                <p className="page-copy">
                  A Decent Sampler instrument designed with physical impact, warm transients, and playable low-end depth.
                </p>
                <p className="instrument-note">Built for beat makers, trailer composers, and experimental rhythm sculptors.</p>
                <div className="section-actions">
                  <button
                    type="button"
                    className="section-action-btn section-action-cart"
                    onClick={() => addToCart('Nebula Drums')}
                  >
                    Add to Cart
                  </button>
                  <button
                    type="button"
                    className="section-action-btn section-action-buy"
                    onClick={() => onBuyNow('Nebula Drums')}
                  >
                    Buy Now
                  </button>
                </div>
              </div>

              <figure className="drum-sculpture drum-gallery interactive-tilt" data-auto-gallery>
                <div className="drum-gallery-track">
                  <img src="/Nebula%20Series/Drums/Nebula%20Kinetic%20Drums_1.png" alt="Nebula Drums interface view 1" />
                  <img src="/Nebula%20Series/Drums/Drums.png" alt="Nebula Drums interface view 2" />
                  <img src="/Nebula%20Series/Drums/Drums02.png" alt="Nebula Drums interface view 3" />
                </div>
              </figure>
            </div>

            <div className="global-footer-host">
              <GlobalFooter />
            </div>
          </div>
        </section>

        <section className="page page-sample-pack" data-page="sample-pack" aria-hidden="true">
          <div className="page-scroll page-shell">
            <div className="sample-layout">
              <div className="sample-copy parallax-node" data-depth="10">
                <p className="section-overline">Sample Pack</p>
                <h1 className="page-title glitch-title">Glitch Drum Pack Vol.1</h1>
                <p className="page-copy">
                  Raw, fractured percussion with aggressive transients and digital grain for modern production.
                </p>
                <div className="glitch-tags" aria-label="Pack mood tags">
                  <span>GLITCH</span>
                  <span>RAW</span>
                  <span>TRANSIENT</span>
                  <span>TEXTURE</span>
                </div>
                <div className="section-actions">
                  <button
                    type="button"
                    className="section-action-btn section-action-cart"
                    onClick={() => addToCart('Glitch Drum Pack Vol.1')}
                  >
                    Add to Cart
                  </button>
                  <button
                    type="button"
                    className="section-action-btn section-action-buy"
                    onClick={() => onBuyNow('Glitch Drum Pack Vol.1')}
                  >
                    Buy Now
                  </button>
                </div>
              </div>

              <figure className="pack-art pack-gallery interactive-tilt" data-auto-gallery>
                <div className="pack-gallery-track">
                  <img src="/GlitchDrum/GlitchDrum.png" alt="Glitch Drum Pack artwork view 1" />
                  <img src="/GlitchDrum/GD_2.png" alt="Glitch Drum Pack artwork view 2" />
                </div>
              </figure>

              <div className="glitch-marquee" aria-hidden="true">
                <span>FARMVERB GLITCH DRUM PACK VOL.1 / DIGITAL DUST / BROKEN RHYTHM / SHARP IMPACT /</span>
              </div>
            </div>

            <div className="global-footer-host">
              <GlobalFooter />
            </div>
          </div>
        </section>

        <section className="page page-support" data-page="support" aria-hidden="true">
          <div className="page-scroll page-shell support-layout">
            <p className="section-overline">Support</p>
            <h1 className="page-title">Need Help With Your Setup?</h1>
            <p className="page-copy">For installation, license, and product support, reach out anytime.</p>

            <a className="support-mail" href="mailto:support@farmverb.com">
              support@farmverb.com
            </a>

            <div className="support-links">
              <a href="https://www.instagram.com/farmverb/" target="_blank" rel="noopener noreferrer">
                Instagram
              </a>
              <a href="https://smartstore.naver.com/farmverb" target="_blank" rel="noopener noreferrer">
                SmartStore
              </a>
            </div>

            <div className="global-footer-host">
              <GlobalFooter />
            </div>
          </div>
        </section>
      </main>

      {buyNowNotice ? (
        <div className="buy-now-toast" role="status" aria-live="polite">
          {buyNowNotice}
        </div>
      ) : null}
    </div>
  );
}
