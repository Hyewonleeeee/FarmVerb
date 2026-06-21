'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import AuthNav from '@/components/auth/AuthNav';
import GlobalFooter from '@/components/farmverb/GlobalFooter';
import { addItemToCart, getCartItemCount, getCartItems, subscribeToCart, type CartItem } from '@/lib/cart/store';
import { formatUsdPrice, getLimitedSalePrice, getMainProductPrice, getProductPricing } from '@/lib/pricing/products';
import {
  DEFAULT_PLUGIN_SECTION,
  type PluginSectionKey,
  type RouteKey,
  buildRouteHref,
  getRouteStateFromLocation,
} from '@/lib/ui/farmVerbRoutes';
import { initFarmVerbSite } from '@/lib/ui/initFarmVerbSite';

type PluginProduct = {
  section: Exclude<PluginSectionKey, 'series'>;
  name: string;
  description: string;
  images?: string[];
  unavailable?: boolean;
};

type HomeFeatureCard = {
  eyebrow: string;
  name: string;
  description: string;
  image: string;
  href: string;
  route: RouteKey;
  pluginSection?: PluginSectionKey;
  productName: string;
  ctaLabel: string;
};

type HomeStoryCard = {
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  href: string;
  ctaLabel: string;
};

const AUDIO_PLUGIN_MENU_ITEMS: Array<{ label: string; section: PluginSectionKey }> = [
  { label: 'Nebula Series', section: 'series' },
  { label: 'Nebula Crush', section: 'nebula-crush' },
  { label: 'Nebula Space', section: 'nebula-space' },
  { label: 'Nebula Drift', section: 'nebula-drift' },
  { label: 'Nebula Rift', section: 'nebula-rift' }
];

const GLITCH_FEATURES = [
  {
    title: 'Drums',
    body: 'Tight low-end impact and ultra-short transients designed for modern drum programming.'
  },
  {
    title: 'Glitch Hats',
    body: 'Irregular rhythmic elements, digital artifacts, and micro-textural movement.'
  },
  {
    title: 'Texture',
    body: 'Noise layers, grain sources, clicks, and atmospheric digital fragments.'
  },
  {
    title: 'Perc FX & Clicks',
    body: 'Experimental percussion elements for layering, transitions, and rhythmic accents.'
  }
] as const;

type SampleSpecItem = {
  label: string;
  value: string;
};

const GLITCH_SPEC_ITEMS: SampleSpecItem[] = [
  { label: 'Format', value: 'WAV 24-bit / 48 kHz' },
  { label: 'Files', value: '100 Samples' },
  { label: 'Size', value: '284 MB' },
  { label: 'Categories', value: 'Drums, Glitch Hats, Texture, Perc FX, Clicks' },
  {
    label: 'Compatibility',
    value: 'Ableton Live, Logic Pro, FL Studio, Pro Tools, Studio One, and most modern DAWs'
  }
];

const GLITCH_AUDIENCES = [
  {
    title: 'Electronic Producers',
    body: 'For minimal techno, IDM, glitch, and experimental electronic music.'
  },
  {
    title: 'Sound Designers',
    body: 'For creating unique transient layers and digital textures.'
  },
  {
    title: 'Game Audio Creators',
    body: 'For futuristic percussion and interactive sound design workflows.'
  }
] as const;

const GLITCH_LICENSE_USE = [
  'Music releases',
  'Games',
  'Films',
  'Broadcasts',
  'Live performances'
] as const;

const GLITCH_VALUE_STRIP = [
  '100 Samples',
  '24-bit / 48 kHz WAV',
  '284 MB Download',
  'Commercial Use Included'
] as const;

function formatTimeLabel(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const rounded = Math.floor(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function ProductPrice({
  productName,
  className = ''
}: {
  productName: string;
  className?: string;
}) {
  const pricing = getProductPricing(productName);
  if (!pricing) {
    return null;
  }

  const mainPrice = getMainProductPrice(pricing);
  const regularPrice = pricing.regularPrice;
  const limitedSalePrice = getLimitedSalePrice(pricing);

  return (
    <div className={`product-price ${className}`.trim()} aria-label={`${productName} pricing`}>
      <div className="product-price-row">
        <strong className="product-price-main">
          {formatUsdPrice(mainPrice)} <span className="product-price-currency">USD</span>
        </strong>
      </div>
      <div className="product-price-meta">
        {regularPrice > mainPrice ? (
          <span className="product-price-regular">Regular Price {formatUsdPrice(regularPrice)}</span>
        ) : null}
        {limitedSalePrice ? (
          <span className="product-price-limited">Limited Promo {formatUsdPrice(limitedSalePrice)} USD</span>
        ) : null}
      </div>
    </div>
  );
}

const NEBULA_PRODUCTS: PluginProduct[] = [
  {
    section: 'nebula-crush',
    name: 'Nebula Crush',
    description: 'Energy-driven harmonic pressure with animated contour and modern punch.',
    images: [
      '/Nebula%20Series/Main/1-Nebula%20Crush.png',
      '/Nebula%20Series/Crush/Nebula%20Crush.png',
      '/Nebula%20Series/Crush/Nebula%20Crush02.png'
    ]
  },
  {
    section: 'nebula-space',
    name: 'Nebula Space',
    description: 'A deep atmospheric field for cinematic distance and blooming tails.',
    images: [
      '/Nebula%20Series/Main/2-Nebula%20Space.png',
      '/Nebula%20Series/Space/Nebula%20Space.png',
      '/Nebula%20Series/Space/Nebula%20Space02.png'
    ]
  },
  {
    section: 'nebula-drift',
    name: 'Nebula Drift',
    description: 'Soft-moving modulation and spectral motion for wide, floating spatial depth.',
    images: ['/Nebula%20Series/Main/3-Nebula%20Drift.png'],
    unavailable: true
  },
  {
    section: 'nebula-rift',
    name: 'Nebula Rift',
    description: 'Sharper fractured motion with tension, contrast, and premium digital grit.',
    images: ['/Nebula%20Series/Main/4-Nebula%20Rift.png'],
    unavailable: true
  }
];

const HOME_FEATURE_CARDS: HomeFeatureCard[] = [
  {
    eyebrow: 'Audio Plugins',
    name: 'Nebula Series',
    description: 'The Nebula overview, anchored by the main series artwork and the brand’s flagship atmosphere.',
    image: '/Nebula%20Series/Main/Nebula%20Series.png',
    href: buildRouteHref('plugins'),
    route: 'plugins',
    productName: 'Nebula Series',
    ctaLabel: 'Explore Series'
  },
  {
    eyebrow: 'Audio Plugin',
    name: 'Nebula Crush',
    description: 'Energy-driven harmonic pressure with animated contour and premium punch.',
    image: '/Nebula%20Series/Main/1-Nebula%20Crush.png',
    href: buildRouteHref('plugins', 'nebula-crush'),
    route: 'plugins',
    pluginSection: 'nebula-crush',
    productName: 'Nebula Crush',
    ctaLabel: 'Explore Plugin'
  },
  {
    eyebrow: 'Audio Plugin',
    name: 'Nebula Space',
    description: 'A deep atmospheric field for cinematic distance and blooming tails.',
    image: '/Nebula%20Series/Main/2-Nebula%20Space.png',
    href: buildRouteHref('plugins', 'nebula-space'),
    route: 'plugins',
    pluginSection: 'nebula-space',
    productName: 'Nebula Space',
    ctaLabel: 'Explore Plugin'
  },
  {
    eyebrow: 'Audio Plugin',
    name: 'Nebula Drift',
    description: 'Soft-moving modulation and spectral motion for wide, floating spatial depth.',
    image: '/Nebula%20Series/Main/3-Nebula%20Drift.png',
    href: buildRouteHref('plugins', 'nebula-drift'),
    route: 'plugins',
    pluginSection: 'nebula-drift',
    productName: 'Nebula Drift',
    ctaLabel: 'Explore Plugin'
  },
  {
    eyebrow: 'Audio Plugin',
    name: 'Nebula Rift',
    description: 'Sharper fractured motion with tension, contrast, and premium digital grit.',
    image: '/Nebula%20Series/Main/4-Nebula%20Rift.png',
    href: buildRouteHref('plugins', 'nebula-rift'),
    route: 'plugins',
    pluginSection: 'nebula-rift',
    productName: 'Nebula Rift',
    ctaLabel: 'Explore Plugin'
  },
  {
    eyebrow: 'Software Instrument',
    name: 'Nebula Drums',
    description: 'A tactile Decent Sampler instrument with physical impact and warm low-end movement.',
    image: '/Nebula%20Series/Main/5-Nebula%20Drums.png',
    href: buildRouteHref('instrument'),
    route: 'instrument',
    productName: 'Nebula Drums',
    ctaLabel: 'Explore Instrument'
  },
  {
    eyebrow: 'Sample Pack',
    name: 'Glitch Drum Pack Vol. I',
    description: 'Fractured percussion, digital grit, and ready-to-use motion for modern production.',
    image: '/GlitchDrum/GlitchDrum.png',
    href: buildRouteHref('sample-pack'),
    route: 'sample-pack',
    productName: 'Glitch Drum Pack Vol.1',
    ctaLabel: 'Explore Pack'
  }
];

const HOME_STORY_CARDS: HomeStoryCard[] = [
  {
    eyebrow: 'FarmVerb Journal',
    title: 'In a field of noise, make music that matters.',
    description: 'A warm editorial opening that keeps the page commercial and calm without becoming a gallery.',
    image: '/Main/Main.jpg',
    href: buildRouteHref('plugins'),
    ctaLabel: 'Explore Products'
  },
  {
    eyebrow: 'Studio View',
    title: 'Texture, motion, and depth.',
    description: 'Images and type working together like a premium landing page, not a shop grid.',
    image: '/Main/Main_2.jpg',
    href: buildRouteHref('sample-pack'),
    ctaLabel: 'View Sample Pack'
  },
  {
    eyebrow: 'Creative Tools',
    title: 'Warm tools for modern sound.',
    description: 'Clear, editorial spacing with room for the FarmVerb identity to breathe.',
    image: '/Main/Main_3.jpg',
    href: buildRouteHref('instrument'),
    ctaLabel: 'View Instrument'
  }
];

export default function FarmVerbSite() {
  const [currentRoute, setCurrentRoute] = useState<RouteKey>('home');
  const [activeNebulaSection, setActiveNebulaSection] = useState<PluginSectionKey>(DEFAULT_PLUGIN_SECTION);
  const [pluginMenuOpen, setPluginMenuOpen] = useState(false);
  const audioPluginsMenuRef = useRef<HTMLDivElement | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [buyNowNotice, setBuyNowNotice] = useState<string | null>(null);
  const sampleFilmRef = useRef<HTMLVideoElement | null>(null);
  const sampleFilmContainerRef = useRef<HTMLDivElement | null>(null);
  const [sampleFilmPlaying, setSampleFilmPlaying] = useState(false);
  const [sampleFilmCurrentTime, setSampleFilmCurrentTime] = useState(0);
  const [sampleFilmDuration, setSampleFilmDuration] = useState(0);
  const [sampleFilmMuted, setSampleFilmMuted] = useState(false);
  const [sampleFilmVolume, setSampleFilmVolume] = useState(0.85);
  const [sampleFilmFullscreen, setSampleFilmFullscreen] = useState(false);

  useEffect(() => {
    return initFarmVerbSite();
  }, []);

  useEffect(() => {
    const syncFromLocation = () => {
      const { route, pluginSection } = getRouteStateFromLocation(window.location.pathname, window.location.search);
      setCurrentRoute(route);
      setActiveNebulaSection(pluginSection);
      setPluginMenuOpen(false);
    };

    const onRouteChange = (event: Event) => {
      const detail = (event as CustomEvent<{ route?: RouteKey; pluginSection?: PluginSectionKey }>).detail;
      if (!detail?.route) {
        return;
      }

      setCurrentRoute(detail.route);
      setActiveNebulaSection(detail.pluginSection ?? DEFAULT_PLUGIN_SECTION);
      setPluginMenuOpen(false);
    };

    syncFromLocation();
    window.addEventListener('farmverb-routechange', onRouteChange as EventListener);
    window.addEventListener('popstate', syncFromLocation);

    return () => {
      window.removeEventListener('farmverb-routechange', onRouteChange as EventListener);
      window.removeEventListener('popstate', syncFromLocation);
    };
  }, []);

  useEffect(() => {
    setCartItems(getCartItems());
    return subscribeToCart(() => {
      setCartItems(getCartItems());
    });
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

  useEffect(() => {
    if (!pluginMenuOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (audioPluginsMenuRef.current?.contains(target)) {
        return;
      }

      setPluginMenuOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [pluginMenuOpen]);

  useEffect(() => {
    const video = sampleFilmRef.current;
    if (!video) {
      return;
    }

    const syncPlaying = () => setSampleFilmPlaying(!video.paused && !video.ended);
    const syncPaused = () => setSampleFilmPlaying(false);
    const syncTime = () => setSampleFilmCurrentTime(video.currentTime || 0);
    const syncMetadata = () => setSampleFilmDuration(Number.isFinite(video.duration) ? video.duration : 0);
    const syncVolume = () => {
      setSampleFilmMuted(video.muted);
      setSampleFilmVolume(video.volume);
    };

    video.addEventListener('play', syncPlaying);
    video.addEventListener('pause', syncPaused);
    video.addEventListener('ended', syncPaused);
    video.addEventListener('timeupdate', syncTime);
    video.addEventListener('loadedmetadata', syncMetadata);
    video.addEventListener('durationchange', syncMetadata);
    video.addEventListener('volumechange', syncVolume);

    syncMetadata();
    syncVolume();

    return () => {
      video.removeEventListener('play', syncPlaying);
      video.removeEventListener('pause', syncPaused);
      video.removeEventListener('ended', syncPaused);
      video.removeEventListener('timeupdate', syncTime);
      video.removeEventListener('loadedmetadata', syncMetadata);
      video.removeEventListener('durationchange', syncMetadata);
      video.removeEventListener('volumechange', syncVolume);
    };
  }, []);

  useEffect(() => {
    const video = sampleFilmRef.current;
    if (!video) {
      return;
    }

    video.muted = sampleFilmMuted;
  }, [sampleFilmMuted]);

  useEffect(() => {
    const video = sampleFilmRef.current;
    if (!video) {
      return;
    }

    video.volume = sampleFilmVolume;
  }, [sampleFilmVolume]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setSampleFilmFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  const selectedSeriesProduct = useMemo(() => {
    if (activeNebulaSection === DEFAULT_PLUGIN_SECTION) {
      return null;
    }

    return NEBULA_PRODUCTS.find((product) => product.section === activeNebulaSection) ?? null;
  }, [activeNebulaSection]);

  const visibleProducts = useMemo(() => {
    if (activeNebulaSection === DEFAULT_PLUGIN_SECTION) {
      return NEBULA_PRODUCTS;
    }

    return selectedSeriesProduct ? [selectedSeriesProduct] : NEBULA_PRODUCTS;
  }, [activeNebulaSection, selectedSeriesProduct]);

  const glitchPackPricing = getProductPricing('Glitch Drum Pack Vol.1');
  const glitchPackPrice = glitchPackPricing ? getMainProductPrice(glitchPackPricing) : 49;
  const glitchPackRegularPrice = glitchPackPricing?.regularPrice ?? 99;

  const showSeriesFeature = Boolean(selectedSeriesProduct) && activeNebulaSection !== DEFAULT_PLUGIN_SECTION && currentRoute === 'plugins';

  const activePluginMenuSection = currentRoute === 'plugins' ? activeNebulaSection : null;

  const selectNebulaSection = (section: PluginSectionKey) => {
    setCurrentRoute('plugins');
    setActiveNebulaSection(section);
    setPluginMenuOpen(false);
  };

  const onProductNameClick = (section: Exclude<PluginSectionKey, 'series'>) => {
    selectNebulaSection(section);
  };

  const renderSeriesFeature = () => {
    if (!showSeriesFeature || !selectedSeriesProduct) {
      return null;
    }

    return (
      <section className="plugin-feature-stage plugin-feature-nebula interactive-tilt" aria-label={`${selectedSeriesProduct.name} detail`}>
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
          <ProductPrice productName={selectedSeriesProduct.name} />
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
    <div className="plugin-grid plugin-grid-nebula" role="list" aria-label="Nebula Series products">
      {visibleProducts.map((product) => (
        <article
          key={product.name}
          className={`plugin-card plugin-card-nebula interactive-tilt ${product.unavailable ? 'is-unavailable' : ''}`}
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
            <h3>
              <button
                type="button"
                className="plugin-card-name-link"
                onClick={() => onProductNameClick(product.section)}
                data-route="plugins"
                data-plugin-section={product.section}
                aria-label={`Open ${product.name} section`}
              >
                {product.name}
              </button>
            </h3>
            <p>{product.description}</p>
            <ProductPrice productName={product.name} />
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

  const cartItemCount = useMemo(() => getCartItemCount(cartItems), [cartItems]);

  const addToCart = (productName: string) => {
    const nextCart = addItemToCart(productName);
    setCartItems(nextCart);
  };

  const onBuyNow = (productName: string) => {
    setBuyNowNotice(`${productName} checkout is coming soon.`);
  };

  const toggleSampleFilm = async () => {
    const video = sampleFilmRef.current;
    if (!video) {
      return;
    }

    if (video.paused || video.ended) {
      video.muted = sampleFilmMuted;

      try {
        await video.play();
      } catch {
        setSampleFilmPlaying(false);
      }
      return;
    }

    video.pause();
  };

  const seekSampleFilm = (nextTime: number) => {
    const video = sampleFilmRef.current;
    if (!video || !Number.isFinite(nextTime)) {
      return;
    }

    const clampedTime = Math.max(0, Math.min(sampleFilmDuration || nextTime, nextTime));
    video.currentTime = clampedTime;
    setSampleFilmCurrentTime(clampedTime);
  };

  const handleSampleFilmProgressChange = (event: ChangeEvent<HTMLInputElement>) => {
    seekSampleFilm(Number(event.target.value));
  };

  const handleSampleFilmVolumeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextVolume = Math.max(0, Math.min(1, Number(event.target.value)));
    setSampleFilmVolume(nextVolume);
    if (nextVolume > 0 && sampleFilmMuted) {
      setSampleFilmMuted(false);
    }
  };

  const toggleSampleFilmMuted = () => {
    setSampleFilmMuted((currentMuted) => !currentMuted);
  };

  const toggleSampleFilmFullscreen = async () => {
    const target = sampleFilmContainerRef.current;
    if (!target) {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (target.requestFullscreen) {
        await target.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen failures.
    }
  };

  return (
    <div className="farmverb-root">
      <div className="grain-layer" aria-hidden="true" />

      <header className="site-header">
        <nav className="site-nav site-container" aria-label="Primary navigation">
          <div className="nav-group nav-left">
            <Link href="/instrument" className="nav-link" data-route="instrument">
              Software Instrument
            </Link>
            <div className={`nav-dropdown ${pluginMenuOpen ? 'is-open' : ''}`} ref={audioPluginsMenuRef}>
              <button
                type="button"
                className="nav-link nav-link-trigger"
                aria-haspopup="menu"
                aria-expanded={pluginMenuOpen}
                aria-controls="audio-plugins-dropdown"
                onClick={() => setPluginMenuOpen((current) => !current)}
              >
                <span>Audio Plugins</span>
                <span className="nav-dropdown-caret" aria-hidden="true">
                  ▾
                </span>
              </button>
              <div id="audio-plugins-dropdown" className="nav-dropdown-panel" role="menu" aria-label="Audio Plugins">
                {AUDIO_PLUGIN_MENU_ITEMS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className={`nav-dropdown-item ${activePluginMenuSection === item.section ? 'is-active' : ''}`}
                    data-route="plugins"
                    data-plugin-section={item.section}
                    role="menuitem"
                    onClick={() => selectNebulaSection(item.section)}
                  >
                    <span className="nav-dropdown-item-label">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <Link href="/sample-pack" className="nav-link" data-route="sample-pack">
              Sample Pack
            </Link>
          </div>

          <Link href="/" className="brand" data-route="home" aria-label="FarmVerb home">
            FARMVERB
          </Link>

          <div className="nav-group nav-right">
            <Link href="/support" className="nav-link nav-link-support" data-route="support">
              Support
            </Link>
            <Link
              href="/cart"
              className="cart-trigger"
              aria-label={`Shopping cart, ${cartItemCount} item${cartItemCount === 1 ? '' : 's'}`}
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
            </Link>
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

          <div className="page-scroll page-shell site-container home-scroll">
            <div className="home-stage parallax-node" data-depth="16">
              <p className="section-overline">FarmVerb Sonic Atelier</p>
              <h1 className="hero-title">Grow Your Sound</h1>
              <p className="hero-copy">Organic tools for producers and sound designers</p>
              <Link href="/plugins" className="hero-link" data-route="plugins">
                Enter Audio Plugins
              </Link>
            </div>

            <section className="home-story" aria-label="FarmVerb studio visuals">
              <article className="home-story-feature">
                <figure className="home-story-feature-media interactive-tilt">
                  <img src={HOME_STORY_CARDS[0].image} alt={HOME_STORY_CARDS[0].title} />
                </figure>
                <div className="home-story-feature-copy">
                  <p className="section-overline">{HOME_STORY_CARDS[0].eyebrow}</p>
                  <h2>{HOME_STORY_CARDS[0].title}</h2>
                  <p>{HOME_STORY_CARDS[0].description}</p>
                  <Link href={HOME_STORY_CARDS[0].href} className="home-story-link">
                    {HOME_STORY_CARDS[0].ctaLabel}
                  </Link>
                </div>
              </article>
            </section>

            <section className="home-showcase" aria-label="Featured FarmVerb products">
              <div className="home-showcase-head">
                <p className="section-overline">Featured Products</p>
                <h2 className="home-showcase-title">Warm tools for modern sound.</h2>
                <p className="home-showcase-copy">
                  A small, curated set of instruments, plugins, and sample packs shaped around texture, movement,
                  and depth.
                </p>
              </div>

              <div className="home-product-grid">
                {HOME_FEATURE_CARDS.map((card) => (
                  <article key={card.name} className="home-product-card interactive-tilt">
                    <figure className="home-product-media">
                      <img src={card.image} alt={card.name} />
                    </figure>

                    <div className="home-product-copy">
                      <p className="home-product-eyebrow">{card.eyebrow}</p>
                      <h3>{card.name}</h3>
                      <p>{card.description}</p>
                      <ProductPrice productName={card.productName} className="home-product-price" />
                    </div>

                    <div className="home-product-actions">
                      <Link
                        href={card.href}
                        className="section-action-btn section-action-buy home-product-link"
                        data-route={card.route}
                        data-plugin-section={card.pluginSection}
                      >
                        {card.ctaLabel}
                      </Link>
                      <button
                        type="button"
                        className="section-action-btn section-action-cart"
                        onClick={() => addToCart(card.productName)}
                      >
                        Add to Cart
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="home-glitch-feature" aria-label="Glitch Drum Pack spotlight">
              <article className="home-glitch-card interactive-tilt">
                <figure className="home-glitch-media">
                  <img src="/GlitchDrum/GlitchDrum.png" alt="Glitch Drum Pack artwork" />
                </figure>

                <div className="home-glitch-copy">
                  <p className="section-overline">Sample Pack</p>
                  <h2>Glitch Drum Pack Vol. I</h2>
                  <p>
                    Fractured percussion, digital grit, and ready-to-use motion for modern production.
                  </p>
                  <ProductPrice productName="Glitch Drum Pack Vol.1" className="home-product-price home-glitch-price" />
                  <div className="home-product-actions home-glitch-actions">
                    <Link
                      href={buildRouteHref('sample-pack')}
                      className="section-action-btn section-action-buy home-product-link"
                      data-route="sample-pack"
                    >
                      Explore Pack
                    </Link>
                    <button
                      type="button"
                      className="section-action-btn section-action-cart"
                      onClick={() => addToCart('Glitch Drum Pack Vol.1')}
                    >
                      Add to Cart
                    </button>
                  </div>
                </div>
              </article>
            </section>

            <section className="home-ending-gallery" aria-label="Additional homepage visuals">
              {HOME_STORY_CARDS.slice(1).map((card) => (
                <article key={card.title} className="home-ending-item">
                  <figure className="home-ending-media interactive-tilt">
                    <img src={card.image} alt={card.title} />
                  </figure>
                  <div className="home-ending-copy">
                    <p className="section-overline">{card.eyebrow}</p>
                    <h3>{card.title}</h3>
                    <p>{card.description}</p>
                    <Link href={card.href} className="home-story-link">
                      {card.ctaLabel}
                    </Link>
                  </div>
                </article>
              ))}
            </section>

            <div className="global-footer-host">
              <GlobalFooter />
            </div>
          </div>
        </section>

        <section className="page page-plugins" data-page="plugins" aria-hidden="true">
          <div className="page-scroll page-shell site-container">
            <section className="plugins-hero parallax-node" data-depth="10">
              <p className="section-overline">Audio Plugins</p>
              <h1 className="page-title">Signal Shaping for Living Space</h1>
              <p className="page-copy">
                FarmVerb plugins balance detailed texture and open-air depth, built for warm movement and character.
              </p>
            </section>

            <section className="plugin-series-view">
              <div className="title-block">
                <p className="section-overline">Nebula Series</p>
                <h2>Nebula Series</h2>
                <p>Choose the overview or jump straight into an individual device from the Audio Plugins menu.</p>
              </div>

              {renderSeriesContent()}
            </section>

            <div className="global-footer-host">
              <GlobalFooter />
            </div>
          </div>
        </section>

        <section className="page page-instrument" data-page="instrument" aria-hidden="true">
          <div className="page-scroll page-shell site-container">
            <div className="instrument-layout">
              <div className="instrument-copy parallax-node" data-depth="12">
                <p className="section-overline">Software Instrument</p>
                <h1 className="page-title">Nebula Drums</h1>
                <p className="page-copy">
                  A Decent Sampler instrument designed with physical impact, warm transients, and playable low-end depth.
                </p>
                <p className="instrument-note">Built for beat makers, trailer composers, and experimental rhythm sculptors.</p>
                <ProductPrice productName="Nebula Drums" className="section-price" />
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
          <div className="page-scroll page-shell site-container">
            <div className="sample-page-stack">
                <div className="sample-hero-grid">
                  <div className="sample-copy parallax-node sample-hero-copy" data-depth="10">
                    <p className="section-overline">Sample Pack</p>
                    <h1 className="page-title sample-hero-title">
                      <span className="sample-hero-title-line">Glitch Drum Pack</span>
                      <span className="sample-hero-title-line sample-hero-title-line-sub">Vol. I</span>
                    </h1>
                    <p className="sample-hero-copy-text">
                      Precision-cut percussion, fractured transients, and digital texture for modern electronic
                      production.
                    </p>

                  <div className="sample-price-rail" aria-label="Glitch Drum Pack Vol. I pricing">
                    <div className="sample-price-main">
                      <span className="sample-price-value">{formatUsdPrice(glitchPackPrice)}</span>
                      <span className="sample-price-unit">USD</span>
                    </div>
                    <div className="sample-price-meta">
                      <span className="sample-price-regular">Regular price {formatUsdPrice(glitchPackRegularPrice)}</span>
                      <span className="sample-price-pill">Intro offer</span>
                    </div>
                  </div>

                  <div className="section-actions sample-hero-actions">
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

                <figure className="pack-art interactive-tilt sample-hero-art sample-hero-cover">
                  <img src="/GlitchDrum/GlitchDrum.png" alt="Glitch Drum Pack artwork" />
                </figure>
              </div>

              <section className="sample-value-strip" aria-label="Product facts">
                {GLITCH_VALUE_STRIP.map((item) => (
                  <div key={item} className="sample-value-item">
                    {item}
                  </div>
                ))}
              </section>

              <section className="sample-panel-section sample-film-section">
                <p className="section-overline">Product Film</p>
                <div className={`sample-film-card ${sampleFilmPlaying ? 'is-playing' : ''}`} ref={sampleFilmContainerRef}>
                  <video
                    ref={sampleFilmRef}
                    className="sample-film-video"
                    muted={sampleFilmMuted}
                    loop
                    playsInline
                    preload="metadata"
                    poster="/GlitchDrum/GlitchDrum.png"
                  >
                    <source src="/GlitchDrum/GlitchMov.mp4" type="video/mp4" />
                  </video>
                  <div className="sample-film-overlay" aria-hidden="true" />
                  <button
                    type="button"
                    className="sample-film-play"
                    onClick={() => void toggleSampleFilm()}
                    aria-label={sampleFilmPlaying ? 'Pause product film' : 'Play product film with sound'}
                  >
                    <span className="sample-film-play-icon" aria-hidden="true">
                      {sampleFilmPlaying ? '❚❚' : '▶'}
                    </span>
                  </button>
                  <div className="sample-film-controls" aria-label="Video controls">
                    <button
                      type="button"
                      className="sample-film-control-button"
                      onClick={() => void toggleSampleFilm()}
                      aria-label={sampleFilmPlaying ? 'Pause video' : 'Play video'}
                    >
                      {sampleFilmPlaying ? (
                        <span aria-hidden="true">❚❚</span>
                      ) : (
                        <span aria-hidden="true">▶</span>
                      )}
                    </button>

                    <span className="sample-film-time" aria-label="Playback time">
                      {formatTimeLabel(sampleFilmCurrentTime)} / {formatTimeLabel(sampleFilmDuration)}
                    </span>

                    <div className="sample-film-range-wrap sample-film-progress-wrap">
                      <input
                        className="sample-film-range sample-film-progress"
                        type="range"
                        min={0}
                        max={sampleFilmDuration || 0}
                        step="0.01"
                        value={Math.min(sampleFilmCurrentTime, sampleFilmDuration || sampleFilmCurrentTime)}
                        onChange={handleSampleFilmProgressChange}
                        aria-label="Seek video"
                        disabled={sampleFilmDuration <= 0}
                      />
                    </div>

                    <button
                      type="button"
                      className="sample-film-control-button"
                      onClick={toggleSampleFilmMuted}
                      aria-label={sampleFilmMuted || sampleFilmVolume === 0 ? 'Unmute video' : 'Mute video'}
                    >
                      {sampleFilmMuted || sampleFilmVolume === 0 ? (
                        <span aria-hidden="true">🔇</span>
                      ) : (
                        <span aria-hidden="true">🔈</span>
                      )}
                    </button>

                    <div className="sample-film-range-wrap sample-film-volume-wrap">
                      <input
                        className="sample-film-range sample-film-volume"
                        type="range"
                        min={0}
                        max={1}
                        step="0.01"
                        value={sampleFilmVolume}
                        onChange={handleSampleFilmVolumeChange}
                        aria-label="Volume"
                      />
                    </div>

                    <button
                      type="button"
                      className="sample-film-control-button"
                      onClick={() => void toggleSampleFilmFullscreen()}
                      aria-label={sampleFilmFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                    >
                      {sampleFilmFullscreen ? <span aria-hidden="true">⤢</span> : <span aria-hidden="true">⛶</span>}
                    </button>
                  </div>
                </div>
                <p className="sample-film-caption">Fractured rhythm. Digital texture. Controlled chaos.</p>
              </section>

              <section className="sample-panel-section sample-story-section">
                <div className="sample-story-grid sample-story-grid-primary">
                  <div className="sample-story-head">
                    <p className="section-overline">Why This Pack</p>
                    <h2 className="sample-story-title">Fractured rhythm. Digital texture. Controlled chaos.</h2>
                    <p className="sample-story-copy">
                      Glitch Drum Pack Vol. I is designed for producers who want precise transients, unstable digital
                      textures, and percussion that cuts through modern electronic production.
                    </p>
                  </div>
                  <figure className="sample-story-art interactive-tilt sample-story-art-primary">
                    <img src="/GlitchDrum/GD_2.png" alt="Glitch Drum Pack product still" />
                  </figure>
                </div>

                <div className="sample-story-grid sample-story-grid-secondary">
                  <figure className="sample-story-art interactive-tilt sample-story-art-secondary">
                    <img src="/GlitchDrum/GD_5.png" alt="Glitch Drum Pack studio scene" />
                  </figure>
                  <div className="sample-story-side">
                    <p className="section-overline">Studio Detail</p>
                    <h3 className="sample-story-side-title">Built to sit cleanly inside a modern mix.</h3>
                    <p className="sample-story-copy sample-story-copy-tight">
                      Tight transients, unstable fragments, and quiet digital grit shaped for fast production and
                      deliberate contrast.
                    </p>
                  </div>
                </div>
              </section>

              <section className="sample-panel-section">
                <p className="section-overline">What&apos;s Inside</p>
                <div className="sample-feature-grid">
                  {GLITCH_FEATURES.map((feature) => (
                    <article key={feature.title} className="sample-feature-card">
                      <h3>{feature.title}</h3>
                      <p>{feature.body}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="sample-panel-section">
                <p className="section-overline">Technical Specifications</p>
                <article className="sample-spec-card sample-spec-card-wide">
                  <p className="sample-spec-note">Built for modern DAWs and sample-based production workflows.</p>
                  <dl className="sample-spec-list sample-spec-list-wide">
                    {GLITCH_SPEC_ITEMS.map((item) => (
                      <div key={item.label} className="sample-spec-row">
                        <dt>{item.label}</dt>
                        <dd>{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              </section>

              <section className="sample-panel-section">
                <p className="section-overline">Built For</p>
                <div className="sample-audience-grid">
                  {GLITCH_AUDIENCES.map((audience) => (
                    <article key={audience.title} className="sample-audience-card">
                      <h3>{audience.title}</h3>
                      <p>{audience.body}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="sample-panel-section sample-license-section">
                <p className="section-overline">License</p>
                <article className="sample-license-card">
                  <p className="sample-license-body">Commercial use allowed.</p>
                  <p className="sample-license-body">You may use these sounds in music releases, games, films, broadcasts, and live performances.</p>
                  <p className="sample-license-body">
                    Redistribution or resale of the raw sample files is prohibited. Projects created with the samples
                    may be distributed freely.
                  </p>
                  <ul className="sample-license-list">
                    {GLITCH_LICENSE_USE.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              </section>

              <section className="sample-panel-section sample-about-section">
                <p className="section-overline">About FARMVERB</p>
                <div className="sample-about-grid">
                  <div>
                    <h2 className="sample-section-title sample-about-title">FARMVERB</h2>
                    <p className="sample-section-copy">
                      FARMVERB is an independent audio label exploring the intersection of rhythm, texture, and
                      space.
                    </p>
                    <p className="sample-section-copy">
                      From sample libraries to audio plug-ins and experimental sound tools, every release is designed
                      around a single goal: creating inspiring sonic materials for modern creators.
                    </p>
                  </div>
                  <div className="sample-about-note">
                    <p>Creating inspiring sonic materials for modern creators.</p>
                  </div>
                </div>
              </section>
            </div>

            <div className="global-footer-host">
              <GlobalFooter />
            </div>
          </div>
        </section>

        <section className="page page-support" data-page="support" aria-hidden="true">
          <div className="page-scroll page-shell site-container support-layout">
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
