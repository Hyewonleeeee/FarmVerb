'use client';

import Link from 'next/link';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react';
import AuthNav from '@/components/auth/AuthNav';
import AudioPluginsMegaMenu from '@/components/farmverb/AudioPluginsMegaMenu';
import MobileSiteNavigation from '@/components/farmverb/MobileSiteNavigation';
import GlobalFooter from '@/components/farmverb/GlobalFooter';
import YouTubeDemo from '@/components/farmverb/YouTubeDemo';
import { FARMVERB_SOCIAL_LINKS } from '@/lib/content/socialLinks';
import {
  addItemToCart,
  getCatalogProductByName,
  getCartItemCount,
  getCartItems,
  subscribeToCart,
  type CartItem
} from '@/lib/cart/store';
import { getLemonBuyButtonLabel, getLemonCheckoutUrlByProductName, getLemonMyOrdersUrl } from '@/lib/checkout/lemonLinks';
import {
  formatUsdPrice,
  getLimitedSalePrice,
  getMainProductPrice,
  getProductPricing,
  getProductYoutubeVideoId
} from '@/lib/pricing/products';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import {
  DEFAULT_PLUGIN_SECTION,
  type PluginSectionKey,
  type RouteKey,
  buildRouteHref,
  getRouteStateFromLocation,
} from '@/lib/ui/farmVerbRoutes';
import { initFarmVerbSite } from '@/lib/ui/initFarmVerbSite';
import { pauseAllYouTubePlayers } from '@/lib/ui/youtubePlaybackManager';

type PluginProduct = {
  section: PluginSectionKey;
  name: string;
  description: string;
  images?: string[];
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

const ACCOUNT_UI_ENABLED = process.env.NEXT_PUBLIC_ENABLE_ACCOUNT_UI !== 'false';

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

type SupportRequirementGroup = {
  label: string;
  items: string[];
};

type FaqItem = {
  question: string;
  answer: string;
};

type ManualDownloadItem = {
  label: string;
  href: string;
};

type ProductSupportDetails = {
  title: string;
  description: string;
  requirements: SupportRequirementGroup[];
  manuals: ManualDownloadItem[];
  faqs: FaqItem[];
  relatedProducts: string[];
};

type ProductFeatureItem = {
  title: string;
  body: string;
};

type ProductCommercialDetails = {
  productName: string;
  eyebrow: string;
  headline: string;
  subhead: string;
  body: string;
  image: string;
  galleryImages?: string[];
  imageAlt: string;
  imageLayout: 'wide' | 'square' | 'portrait';
  valueItems: string[];
  features: ProductFeatureItem[];
  workflow: ProductFeatureItem[];
  relatedProducts: string[];
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

const NEBULA_BUNDLE_PRODUCT: PluginProduct = {
  section: 'series',
  name: 'Nebula Series Bundle',
  description: 'The complete Nebula bundle: Crush, Space, Drift, and Rift in one polished plugin collection.',
  images: ['/Nebula%20Series/Main/Nebula%20Series.png']
};

const NEBULA_PRODUCTS: PluginProduct[] = [
  {
    section: 'nebula-crush',
    name: 'Nebula Crush',
    description: 'Energy-driven harmonic pressure with animated contour and modern punch.',
    images: ['/Nebula%20Series/Main/1-Nebula%20Crush.png']
  },
  {
    section: 'nebula-space',
    name: 'Nebula Space',
    description: 'A deep atmospheric field for cinematic distance and blooming tails.',
    images: ['/Nebula%20Series/Main/2-Nebula%20Space.png']
  },
  {
    section: 'nebula-drift',
    name: 'Nebula Drift',
    description: 'Soft-moving modulation and spectral motion for wide, floating spatial depth.',
    images: ['/Nebula%20Series/Main/3-Nebula%20Drift.png']
  },
  {
    section: 'nebula-rift',
    name: 'Nebula Rift',
    description: 'Sharper fractured motion with tension, contrast, and premium digital grit.',
    images: ['/Nebula%20Series/Main/4-Nebula%20Rift.png']
  }
];

const ORGANIC_BUNDLE_PRODUCT: PluginProduct = {
  section: 'organic-series',
  name: 'Organic Series Bundle',
  description: 'Jeju Citrus Air, Boseong Green Tea, and Uiseong Garlic in one focused collection.',
  images: ['/Organic%20Series/Organic%20Series%20Bundle.png']
};

const ORGANIC_PRODUCTS: PluginProduct[] = [
  {
    section: 'jeju-citrus-air',
    name: 'Jeju Citrus Air',
    description: 'An octave-led shimmer reverb for presence, air, and a wider late field.',
    images: ['/Organic%20Series/Main-Jeju.png']
  },
  {
    section: 'boseong-green-tea',
    name: 'Boseong Green Tea',
    description: 'A focused richness processor for smoother, denser, creamier tone.',
    images: ['/Organic%20Series/Main-Boseong.png']
  },
  {
    section: 'uiseong-garlic',
    name: 'Uiseong Garlic',
    description: 'A definition processor that brings weak or buried sources forward.',
    images: ['/Organic%20Series/Main-Uiseong.png']
  }
];

const ALL_PLUGIN_PRODUCTS: PluginProduct[] = [
  NEBULA_BUNDLE_PRODUCT,
  ...NEBULA_PRODUCTS,
  ORGANIC_BUNDLE_PRODUCT,
  ...ORGANIC_PRODUCTS
];

const HOME_FEATURE_CARDS: HomeFeatureCard[] = [
  {
    eyebrow: 'Audio Plugins',
    name: 'Nebula Series Bundle',
    description: 'Four creative effects for saturation, space, motion, and fracture, with Nebula Drums included as a bonus.',
    image: '/Nebula%20Series/Main/Nebula%20Series.png',
    href: buildRouteHref('plugins'),
    route: 'plugins',
    productName: 'Nebula Series Bundle',
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

const ORGANIC_PRODUCT_CARDS: HomeFeatureCard[] = [
  {
    eyebrow: 'Organic Series',
    name: 'Organic Series Bundle',
    description: 'Three focused processors for air, richness, and definition.',
    image: '/Organic%20Series/Organic%20Series%20Bundle.png',
    href: buildRouteHref('plugins', 'organic-series'),
    route: 'plugins',
    pluginSection: 'organic-series',
    productName: 'Organic Series Bundle',
    ctaLabel: 'Explore Series'
  },
  {
    eyebrow: 'Organic Series',
    name: 'Jeju Citrus Air',
    description: 'Octave-led shimmer reverb with Vocal and Ambient modes.',
    image: '/Organic%20Series/Main-Jeju.png',
    href: buildRouteHref('plugins', 'jeju-citrus-air'),
    route: 'plugins',
    pluginSection: 'jeju-citrus-air',
    productName: 'Jeju Citrus Air',
    ctaLabel: 'Explore Plugin'
  },
  {
    eyebrow: 'Organic Series',
    name: 'Boseong Green Tea',
    description: 'Focused richness for smoother, denser, creamier sources.',
    image: '/Organic%20Series/Main-Boseong.png',
    href: buildRouteHref('plugins', 'boseong-green-tea'),
    route: 'plugins',
    pluginSection: 'boseong-green-tea',
    productName: 'Boseong Green Tea',
    ctaLabel: 'Explore Plugin'
  },
  {
    eyebrow: 'Organic Series',
    name: 'Uiseong Garlic',
    description: 'Definition and forward placement for weak or buried sources.',
    image: '/Organic%20Series/Main-Uiseong.png',
    href: buildRouteHref('plugins', 'uiseong-garlic'),
    route: 'plugins',
    pluginSection: 'uiseong-garlic',
    productName: 'Uiseong Garlic',
    ctaLabel: 'Explore Plugin'
  }
];

const ORGANIC_PRODUCT_NAMES = new Set(ORGANIC_PRODUCT_CARDS.map((card) => card.productName));

function isOrganicProductName(productName: string) {
  return ORGANIC_PRODUCT_NAMES.has(productName);
}

const HOME_PRODUCT_GRID_CARDS = [
  ...HOME_FEATURE_CARDS.slice(0, -1),
  ...ORGANIC_PRODUCT_CARDS,
  ...HOME_FEATURE_CARDS.slice(-1)
];

const PRODUCT_CARD_CATALOG = HOME_PRODUCT_GRID_CARDS;

const HOME_STORY_CARDS: HomeStoryCard[] = [
  {
    eyebrow: 'FarmVerb Journal',
    title: 'In a field of noise, make music that matters.',
    description: 'Explore expressive audio tools shaped for character, movement, and a musical sense of space.',
    image: '/Main/Main.jpg',
    href: buildRouteHref('plugins'),
    ctaLabel: 'Explore Products'
  },
  {
    eyebrow: 'Studio View',
    title: 'Texture, motion, and depth.',
    description: 'Discover fractured percussion and tactile digital detail built for modern production.',
    image: '/Main/Main_2.jpg',
    href: buildRouteHref('sample-pack'),
    ctaLabel: 'View Sample Pack'
  },
  {
    eyebrow: 'Creative Tools',
    title: 'Warm tools for modern sound.',
    description: 'Move from subtle color to experimental motion with instruments and effects made for creative play.',
    image: '/Main/Main_3.jpg',
    href: buildRouteHref('instrument'),
    ctaLabel: 'View Instrument'
  }
];

const NEBULA_MANUALS = {
  crush: '/Manual/Nebula_Crush_User_Manual.pdf',
  space: '/Manual/Nebula_Space_User_Manual.pdf',
  drift: '/Manual/Nebula_Drift_User_Manual.pdf',
  rift: '/Manual/Nebula_Rift_User_Manual.pdf',
  drums: '/Manual/Nebula_Drums_User_Manual.pdf'
} as const;

const ORGANIC_MANUALS = {
  jeju: '/Manual/Jeju_Citrus_Air_User_Manual.pdf',
  boseong: '/Manual/Boseong_Green_Tea_User_Manual.pdf',
  uiseong: '/Manual/Uiseong_Garlic_User_Manual.pdf'
} as const;

const NEBULA_REAL_IMAGES = {
  crush: '/Real/Crush.png',
  space: '/Real/Space.png',
  drift: '/Real/Drift.png',
  rift: '/Real/Rift.png',
  drums: '/Real/Drums.png'
} as const;

const STANDARD_NEBULA_PLUGIN_REQUIREMENTS: SupportRequirementGroup[] = [
  {
    label: 'macOS',
    items: ['Run installer', 'Choose AU/VST3 locations', 'Rescan your DAW']
  },
  {
    label: 'Windows',
    items: ['Run installer', 'Confirm VST3 path', 'Rescan plugins in host']
  },
  {
    label: 'Formats',
    items: ['VST3', 'AU on macOS', 'AAX']
  },
  {
    label: 'Troubleshooting',
    items: ['Clear plugin cache', 'Run a full rescan']
  }
];

const ORGANIC_COMPATIBILITY_REQUIREMENTS: SupportRequirementGroup[] = [
  {
    label: 'macOS',
    items: ['AU', 'VST3', 'AAX']
  },
  {
    label: 'Windows',
    items: ['VST3', 'AAX']
  },
  {
    label: 'Audio',
    items: ['Mono', 'Stereo', 'Matching input and output layouts']
  }
];

const ORGANIC_PLUGIN_REQUIREMENTS: SupportRequirementGroup[] = [
  ...ORGANIC_COMPATIBILITY_REQUIREMENTS,
  {
    label: 'Downloads',
    items: ['macOS installer', 'Windows installer', 'Available in My Account']
  }
];

const RIFT_REQUIREMENTS: SupportRequirementGroup[] = [
  {
    label: 'macOS VST3',
    items: ['Install Nebula Rift.vst3 to ~/Library/Audio/Plug-Ins/VST3/']
  },
  {
    label: 'macOS AU',
    items: ['Install Nebula Rift.component to ~/Library/Audio/Plug-Ins/Components/']
  },
  {
    label: 'Formats',
    items: ['VST3', 'AU on macOS', 'AAX']
  },
  {
    label: 'Host Scan',
    items: ['Rescan plugins in your DAW', 'Clear host plugin cache if not visible']
  }
];

const DRUMS_REQUIREMENTS: SupportRequirementGroup[] = [
  {
    label: 'Host',
    items: ['Decent Sampler 1.11.1 or later', 'Latest Decent Sampler version recommended']
  },
  {
    label: 'Library Format',
    items: ['30 .dspreset files', 'Open a preset from the FILE… menu']
  },
  {
    label: 'Folder Structure',
    items: ['Keep .dspreset, Samples, and Resources together', 'Do not move the included folders separately']
  },
  {
    label: 'First Preset',
    items: ['01 Hybrid Kinetic Drums.dspreset']
  }
];

const PRODUCT_COMMERCIAL_DETAILS: Record<string, ProductCommercialDetails> = {
  'Nebula Series Bundle': {
    productName: 'Nebula Series Bundle',
    eyebrow: 'Nebula Series Bundle',
    headline: 'The Complete Nebula Collection',
    subhead: 'Four effects for saturation, space, motion, and fracture. Nebula Drums included as a bonus.',
    body: 'Nebula Series Bundle brings the core Nebula processors together as one expandable collection: Crush for harmonic pressure, Space for cinematic ambience, Drift for fluid modulation, and Rift for granular fracture.',
    image: '/Nebula%20Series/Main/Nebula%20Series.png',
    imageAlt: 'Nebula Series bundle artwork',
    imageLayout: 'wide',
    valueItems: ['Crush', 'Space', 'Drift', 'Rift', 'Nebula Drums bonus'],
    features: [
      {
        title: 'Harmonic color',
        body: 'Nebula Crush moves from subtle harmonic color to aggressive modern grit.'
      },
      {
        title: 'Cinematic depth',
        body: 'Nebula Space is built for width, depth, and smooth cinematic tails.'
      },
      {
        title: 'Spatial motion',
        body: 'Nebula Drift adds flowing, phase-like movement with SILK, TIDE, and FRAC modes.'
      },
      {
        title: 'Granular fracture',
        body: 'Nebula Rift captures small fragments and rebuilds them as animated rift fields.'
      }
    ],
    workflow: [
      {
        title: 'Choose a world',
        body: 'Start with the device that matches the movement or texture you need.'
      },
      {
        title: 'Shape the source',
        body: 'Use the core controls from each device to set tone, depth, motion, or fracture.'
      },
      {
        title: 'Blend into the track',
        body: 'Use Mix, Blend, or output-level controls where available to keep the source musical.'
      },
      {
        title: 'Finish in Context',
        body: 'Check the chosen processor in the full mix and set the final blend or output where available.'
      }
    ],
    relatedProducts: ['Glitch Drum Pack Vol.1']
  },
  'Nebula Crush': {
    productName: 'Nebula Crush',
    eyebrow: 'Creative saturation',
    headline: 'Creative Multi-Mode Distortion',
    subhead: 'From subtle saturation to total destruction.',
    body: 'Nebula Crush is an energetic distortion plugin with a cinematic edge, designed for drums, synths, buses, and creative tone shaping.',
    image: NEBULA_REAL_IMAGES.crush,
    imageAlt: 'Nebula Crush product photograph',
    imageLayout: 'wide',
    valueItems: ['Gain', 'Width', 'Tone', 'Output'],
    features: [
      {
        title: 'SAFE / PUNCHY',
        body: 'Switch the response character to fit controlled saturation or more forward punch.'
      },
      {
        title: 'Character Matrix',
        body: 'Select the distortion flavor before dialing the intensity and tone.'
      },
      {
        title: 'Width control',
        body: 'Adjust the stereo width of the processed signal to suit the source and mix.'
      },
      {
        title: 'Output trim',
        body: 'Level match the final signal after shaping the harmonic pressure.'
      }
    ],
    workflow: [
      {
        title: 'Choose character',
        body: 'Start with the distortion flavor that fits the source.'
      },
      {
        title: 'Set Gain',
        body: 'Adjust Gain until the harmonic character lands.'
      },
      {
        title: 'Balance Width and Tone',
        body: 'Set the stereo spread and brightness for the source.'
      },
      {
        title: 'Match Output',
        body: 'Finish by setting the final output level in context.'
      }
    ],
    relatedProducts: ['Nebula Space', 'Nebula Rift', 'Nebula Series Bundle']
  },
  'Nebula Space': {
    productName: 'Nebula Space',
    eyebrow: 'Atmospheric reverb',
    headline: 'Experimental Algorithmic Reverb',
    subhead: 'Build impossible spaces.',
    body: 'Nebula Space is an atmospheric reverb plugin for width, depth, smooth cinematic tails, floating dimension, and ambient motion.',
    image: NEBULA_REAL_IMAGES.space,
    imageAlt: 'Nebula Space product photograph',
    imageLayout: 'wide',
    valueItems: ['Size', 'Early', 'Decay', 'Freeze'],
    features: [
      {
        title: 'Space Field',
        body: 'Shape a wide atmospheric field around the source.'
      },
      {
        title: 'Freeze',
        body: 'Hold the current ambience bed for infinite pads and transition-ready texture beds.'
      },
      {
        title: 'Warp and Mass',
        body: 'Add rear-space motion and body density to the reverb field.'
      },
      {
        title: 'Color and Decay',
        body: 'Tune brightness and tail length for the space around the sound.'
      }
    ],
    workflow: [
      {
        title: 'Set Size',
        body: 'Choose the apparent room scale and tail spread.'
      },
      {
        title: 'Place Early',
        body: 'Adjust early reflection arrival for placement.'
      },
      {
        title: 'Tune Decay and Color',
        body: 'Shape the length and brightness of the tail.'
      },
      {
        title: 'Finish with Warp and Mass',
        body: 'Add movement and low-mid body where the mix needs it.'
      }
    ],
    relatedProducts: ['Nebula Drift', 'Nebula Crush', 'Nebula Series Bundle']
  },
  'Nebula Drift': {
    productName: 'Nebula Drift',
    eyebrow: 'Fluid modulation',
    headline: 'Movement Without Delay',
    subhead: 'Create fluid motion, width, and evolving stereo space.',
    body: 'Nebula Drift is a flowing modulation plugin with atmospheric, phase-like movement for spatial drift, width, and cinematic motion.',
    image: NEBULA_REAL_IMAGES.drift,
    imageAlt: 'Nebula Drift product photograph',
    imageLayout: 'square',
    valueItems: ['SILK', 'TIDE', 'FRAC', 'Motion'],
    features: [
      {
        title: 'Three modes',
        body: 'SILK, TIDE, and FRAC provide distinct movement profiles.'
      },
      {
        title: 'Motion',
        body: 'Set the speed and internal movement rate of the modulation.'
      },
      {
        title: 'Width and Drift',
        body: 'Shape stereo spread and phase-like drift intensity.'
      },
      {
        title: 'Blur and Mix',
        body: 'Soften modulation edges and blend the processed signal.'
      }
    ],
    workflow: [
      {
        title: 'Set Mix',
        body: 'Start by deciding how much movement the source needs.'
      },
      {
        title: 'Shape Width and Drift',
        body: 'Place the motion across the stereo image.'
      },
      {
        title: 'Add Motion and Blur',
        body: 'Control speed and soften the contour.'
      },
      {
        title: 'Finalize Mode',
        body: 'Choose SILK, TIDE, or FRAC for the final movement profile.'
      }
    ],
    relatedProducts: ['Nebula Space', 'Nebula Rift', 'Nebula Series Bundle']
  },
  'Nebula Rift': {
    productName: 'Nebula Rift',
    eyebrow: 'Granular fracture',
    headline: 'Granular Fracture Engine',
    subhead: 'Break audio into evolving textures.',
    body: 'Nebula Rift is a creative granular fracture effect that captures small fragments of incoming audio and rebuilds them as animated rift fields.',
    image: NEBULA_REAL_IMAGES.rift,
    imageAlt: 'Nebula Rift product photograph',
    imageLayout: 'portrait',
    valueItems: ['Soft Rift', 'Glass Crack', 'Deep Tear', 'Fold'],
    features: [
      {
        title: 'Mode Engine',
        body: 'Move between soft fog, glass-like shards, and dark gravity rupture.'
      },
      {
        title: 'Rift Size and Density',
        body: 'Control the grain window, overlap, event pressure, and cloud thickness.'
      },
      {
        title: 'Motion and Fold',
        body: 'Shape read position, stereo drift, nonlinear tearing, and instability.'
      },
      {
        title: 'Preset Vault',
        body: 'Fifteen curated presets are grouped by mode, while Mix stays manual.'
      }
    ],
    workflow: [
      {
        title: 'Choose a mode',
        body: 'Start with Soft Rift, Glass Crack, or Deep Tear.'
      },
      {
        title: 'Set Rift Size',
        body: 'Define the time and spatial scale of the fracture.'
      },
      {
        title: 'Shape Density and Color',
        body: 'Tune event pressure, spectral material, and body-to-edge balance.'
      },
      {
        title: 'Animate with Motion and Fold',
        body: 'Add drift, rupture, and nonlinear tearing.'
      }
    ],
    relatedProducts: ['Nebula Crush', 'Nebula Drift', 'Nebula Series Bundle']
  },
  'Organic Series Bundle': {
    productName: 'Organic Series Bundle',
    eyebrow: 'Organic Series Bundle',
    headline: 'Air, richness, and definition.',
    subhead: 'Three distinct tools for placing a sound exactly where the mix needs it.',
    body: 'Organic Series Bundle brings together Jeju Citrus Air, Boseong Green Tea, and Uiseong Garlic: an octave-led shimmer reverb, a focused richness processor, and a forward definition processor.',
    image: '/Organic%20Series/Organic%20Series%20Bundle.png',
    imageAlt: 'Organic Series Bundle with Jeju Citrus Air, Boseong Green Tea, and Uiseong Garlic',
    imageLayout: 'wide',
    valueItems: ['Jeju Citrus Air', 'Boseong Green Tea', 'Uiseong Garlic'],
    features: [
      {
        title: 'Jeju Citrus Air',
        body: 'Keep vocals present or let instruments bloom into a wider, octave-led shimmer field.'
      },
      {
        title: 'Boseong Green Tea',
        body: 'Round, densify, and smooth thin or spiky sources with a focused richness workflow.'
      },
      {
        title: 'Uiseong Garlic',
        body: 'Bring weak or buried sources forward through definition, onset, placement, and tightness.'
      },
      {
        title: 'Complete Organic Palette',
        body: 'Move from Jeju’s spacious air to Boseong’s density and richness, then Uiseong’s forward definition and presence within one complementary series.'
      }
    ],
    workflow: [
      {
        title: 'Choose the purpose',
        body: 'Start with space, richness, or definition according to what the source needs.'
      },
      {
        title: 'Shape the character',
        body: 'Use the selected plugin’s focused controls to establish tone and placement.'
      },
      {
        title: 'Set the working level',
        body: 'Use Mix on Jeju Citrus Air or Output on Boseong Green Tea and Uiseong Garlic to establish the working balance.'
      },
      {
        title: 'Confirm the result',
        body: 'Compare at a matched listening level and keep the setting only when the source sits more clearly in the full arrangement.'
      }
    ],
    relatedProducts: ['Jeju Citrus Air', 'Boseong Green Tea', 'Uiseong Garlic']
  },
  'Jeju Citrus Air': {
    productName: 'Jeju Citrus Air',
    eyebrow: 'Octave-led shimmer reverb',
    headline: 'Let the air open around the source.',
    subhead: 'Keep vocals present or let instruments bloom into a wider late field.',
    body: 'Jeju Citrus Air blends airy octave shimmer, a quieter fifth, and a diffused stereo tail. Vocal and Ambient modes shift the balance between front-of-mix presence and a wider, longer space.',
    image: '/Organic%20Series/Main-Jeju.png',
    imageAlt: 'Jeju Citrus Air plugin interface',
    imageLayout: 'wide',
    valueItems: ['Vocal', 'Ambient', 'Peel', 'Shine', 'Glow', 'Juice', 'Mix'],
    features: [
      {
        title: 'Vocal / Ambient',
        body: 'Vocal keeps early presence closer; Ambient expands width, decay, and late-field energy.'
      },
      {
        title: 'Peel + Glow',
        body: 'Place and spread the early field with Peel, then shape tail length and shimmer sustain with Glow.'
      },
      {
        title: 'Shine',
        body: 'Raise air, octave shimmer, upper-tone lift, and motion inside the wet field.'
      },
      {
        title: 'Juice + Mix',
        body: 'Add attack-led bloom with Juice, then set the final dry/wet balance with Mix.'
      }
    ],
    workflow: [
      {
        title: 'Choose a mode',
        body: 'Use Vocal for closer placement or Ambient for a wider, longer field.'
      },
      {
        title: 'Set Glow and Peel',
        body: 'Establish the tail, spacing, diffusion, and stereo spread.'
      },
      {
        title: 'Add Shine and Juice',
        body: 'Introduce shimmer energy and attack-responsive bloom.'
      },
      {
        title: 'Finish with Mix',
        body: 'Blend the effect in context, or use 100% for a wet-only signal.'
      }
    ],
    relatedProducts: ['Organic Series Bundle', 'Boseong Green Tea', 'Uiseong Garlic']
  },
  'Boseong Green Tea': {
    productName: 'Boseong Green Tea',
    eyebrow: 'Focused richness processor',
    headline: 'Smooth the edge. Keep the focus.',
    subhead: 'Turn thin or spiky sources into something smoother, denser, and creamier.',
    body: 'Boseong Green Tea centers its workflow on Grow, a macro that combines transient rounding, density, sustain, low-mid body, and placement. Body, Focus, and Air refine the result before final level matching.',
    image: '/Organic%20Series/Main-Boseong.png',
    imageAlt: 'Boseong Green Tea plugin interface',
    imageLayout: 'wide',
    valueItems: ['Grow', 'Body', 'Focus', 'Air', 'Output', 'Auto'],
    features: [
      {
        title: 'Grow',
        body: 'Shape the overall richness response through transient rounding, density, sustain, body, and placement.'
      },
      {
        title: 'Body + Focus',
        body: 'Add low-mid mass with Body, then move generated density from loose to tight with Focus.'
      },
      {
        title: 'Air',
        body: 'Move the top character from silky restraint toward a more open presentation.'
      },
      {
        title: 'Output + Auto',
        body: 'Level match with Output; optional Auto assists level on stronger Grow settings without acting as a limiter.'
      }
    ],
    workflow: [
      {
        title: 'Start with Grow',
        body: 'Set the overall amount of rounding, density, and sustain.'
      },
      {
        title: 'Build Body',
        body: 'Add the low-mid weight the source needs.'
      },
      {
        title: 'Place with Focus and Air',
        body: 'Tighten the generated texture and set the upper character.'
      },
      {
        title: 'Level match',
        body: 'Use Output, with Auto if desired, while checking the DAW meter.'
      }
    ],
    relatedProducts: ['Organic Series Bundle', 'Jeju Citrus Air', 'Uiseong Garlic']
  },
  'Uiseong Garlic': {
    productName: 'Uiseong Garlic',
    eyebrow: 'Forward definition processor',
    headline: 'Bring buried sounds into focus.',
    subhead: 'Move a weak source forward without relying on volume alone.',
    body: 'Uiseong Garlic uses Bite to set the overall Definition amount, then Attack, Forward, and Tight to shape onset, front-to-back placement, and post-onset masking before final output level matching.',
    image: '/Organic%20Series/Main-Uiseong.png',
    imageAlt: 'Uiseong Garlic plugin interface',
    imageLayout: 'wide',
    valueItems: ['Bite', 'Attack', 'Forward', 'Tight', 'Output'],
    features: [
      {
        title: 'Bite',
        body: 'Set the total Definition amount that the other character controls can shape.'
      },
      {
        title: 'Attack',
        body: 'Move the onset from soft to crisp without treating it as a simple level boost.'
      },
      {
        title: 'Forward',
        body: 'Adjust back-to-front placement and midrange articulation rather than brightness alone.'
      },
      {
        title: 'Tight + Output',
        body: 'Reduce post-onset body and masking, then match the finished level in context.'
      }
    ],
    workflow: [
      {
        title: 'Set Bite',
        body: 'Establish enough Definition for the supporting controls to shape.'
      },
      {
        title: 'Tune Attack',
        body: 'Choose a softer or crisper onset for the source.'
      },
      {
        title: 'Place and tighten',
        body: 'Use Forward for placement and Tight for post-onset masking.'
      },
      {
        title: 'Match Output',
        body: 'Set the final level while listening in the full mix.'
      }
    ],
    relatedProducts: ['Organic Series Bundle', 'Jeju Citrus Air', 'Boseong Green Tea']
  },
  'Nebula Drums': {
    productName: 'Nebula Drums',
    eyebrow: 'Creative drum instrument',
    headline: 'Creative Drum Instrument for Decent Sampler',
    subhead: 'Four drum worlds for electronic, cinematic, and experimental rhythm.',
    body: 'Nebula Drums combines four themed drum worlds with custom layered drum sounds created from royalty-free source recordings and original sound design processing.',
    image: NEBULA_REAL_IMAGES.drums,
    imageAlt: 'Nebula Drums product photograph',
    imageLayout: 'wide',
    valueItems: ['Glitch & Industrial', 'Organic Lo-Fi', 'Cybernetic Trap', 'Experimental Cinematic'],
    features: [
      {
        title: 'Four themes',
        body: 'The keyboard maps themed worlds across C1, C2, C3, and C4.'
      },
      {
        title: 'XY Pad',
        body: 'Control multiple effects across wavefolder, phaser, delay, and reverb behavior.'
      },
      {
        title: 'Pattern presets',
        body: 'Pattern-based presets generate rhythmic sequences synchronized to host tempo.'
      },
      {
        title: 'Layered sound design',
        body: 'Body, texture, and top layers combine into playable drum material.'
      }
    ],
    workflow: [
      {
        title: 'Choose a preset',
        body: 'Start with a drum world that matches the rhythm or texture you want to build.'
      },
      {
        title: 'Play a theme',
        body: 'Use the mapped keyboard zones to move between drum worlds.'
      },
      {
        title: 'Shape with XY',
        body: 'Use the XY Pad and front-panel controls for movement and space.'
      },
      {
        title: 'Finish in context',
        body: 'Balance the selected preset and performance against the rest of the track.'
      }
    ],
    relatedProducts: ['Nebula Series Bundle', 'Nebula Crush', 'Glitch Drum Pack Vol.1']
  }
};

const PLUGIN_INSTALL_ANSWER =
  'Run the product installer, select the formats used by your DAW, then rescan plugins in the host. On Windows, follow the locations provided by the Windows installer.';
const PLUGIN_FORMAT_ANSWER =
  'FarmVerb effect releases are provided in VST3, AU on macOS, and AAX formats. Use the format supported by your DAW.';
const PRODUCT_ACCESS_ANSWER =
  'Sign in and open My Account to access verified purchases, available downloads, and license details. You can also use the order link provided with your purchase.';
const PRODUCT_COMMERCIAL_USE_ANSWER =
  'The FarmVerb EULA permits use in personal and commercial music, sound design, and media projects. Product files, installers, license keys, presets, and raw content may not be redistributed or resold as standalone assets.';
const ORGANIC_FORMAT_ANSWER =
  'On macOS, Organic Series plugins are available in AU, VST3, and AAX formats. On Windows, they are available in VST3 and AAX formats. Mono and stereo layouts are supported with matching input and output channels.';
const ORGANIC_INSTALL_ANSWER =
  'Download the installer for your operating system from My Account. On macOS, select the AU, VST3, and/or AAX formats you use. On Windows, select the VST3 and/or AAX formats required by your DAW. After installation, rescan your plugins or restart your DAW if necessary.';
const ORGANIC_ACCESS_ANSWER =
  'Sign in to My Account to view your purchase, download the installer for your operating system, and access your FarmVerb license.';
const ORGANIC_LICENSE_ANSWER =
  'Your FarmVerb license appears in My Account after purchase. Open the plugin in your DAW and complete FarmVerb license activation with that license. Once activation is complete, the plugin is ready to use. When moving to a new computer, manage the activated devices for that license in My Account before activating the new installation.';
const ORGANIC_MANUAL_ANSWER =
  'Use the Download User Manual (PDF) link near the purchase controls at the top of this page.';

const PRODUCT_SUPPORT_DETAILS: Record<string, ProductSupportDetails> = {
  'Nebula Series Bundle': {
    title: 'Nebula Series Bundle Support',
    description: 'Manuals, system notes, and launch information for the Nebula bundle.',
    requirements: [
      {
        label: 'Included FX',
        items: ['Nebula Crush', 'Nebula Space', 'Nebula Drift', 'Nebula Rift']
      },
      {
        label: 'Bonus Instrument',
        items: ['Nebula Drums for Decent Sampler']
      },
      {
        label: 'Plugin Formats',
        items: ['VST3', 'AU on macOS', 'AAX']
      },
      {
        label: 'Instrument Host',
        items: ['Decent Sampler required for Nebula Drums']
      }
    ],
    manuals: [
      { label: 'Nebula Crush Manual', href: NEBULA_MANUALS.crush },
      { label: 'Nebula Space Manual', href: NEBULA_MANUALS.space },
      { label: 'Nebula Drift Manual', href: NEBULA_MANUALS.drift },
      { label: 'Nebula Rift Manual', href: NEBULA_MANUALS.rift },
      { label: 'Nebula Drums Manual', href: NEBULA_MANUALS.drums }
    ],
    faqs: [
      {
        question: 'What is included in the Nebula Series Bundle?',
        answer: 'The bundle includes Nebula Crush, Nebula Space, Nebula Drift, and Nebula Rift, plus Nebula Drums as a bonus instrument.'
      },
      {
        question: 'Does Nebula Drums require anything extra?',
        answer: 'Yes. Install Decent Sampler 1.11.1 or later, with the latest version recommended. Nebula Drums is loaded by opening one of its .dspreset files inside Decent Sampler.'
      },
      {
        question: 'Which formats are included?',
        answer: 'The four Nebula effects are provided in VST3, AU on macOS, and AAX formats. Nebula Drums uses .dspreset files and requires Decent Sampler.'
      },
      {
        question: 'How do I install the bundle?',
        answer: 'Run the installers for the four effects and rescan your DAW. Separately unzip Nebula Drums, keep its .dspreset, Samples, and Resources structure intact, and open a preset from Decent Sampler’s FILE… menu.'
      },
      {
        question: 'Where do I find downloads and license details?',
        answer: PRODUCT_ACCESS_ANSWER
      },
      {
        question: 'Can I use the products commercially?',
        answer: PRODUCT_COMMERCIAL_USE_ANSWER
      }
    ],
    relatedProducts: ['Glitch Drum Pack Vol.1']
  },
  'Nebula Crush': {
    title: 'Nebula Crush Support',
    description: 'Musical saturation for drums, synths, buses, and creative tone shaping.',
    requirements: STANDARD_NEBULA_PLUGIN_REQUIREMENTS,
    manuals: [{ label: 'Nebula Crush User Manual', href: NEBULA_MANUALS.crush }],
    faqs: [
      {
        question: 'How do I install it?',
        answer: PLUGIN_INSTALL_ANSWER
      },
      {
        question: 'Which plugin formats are included?',
        answer: PLUGIN_FORMAT_ANSWER
      },
      {
        question: 'Where do I find downloads and license details?',
        answer: PRODUCT_ACCESS_ANSWER
      },
      {
        question: 'Can I use it commercially?',
        answer: PRODUCT_COMMERCIAL_USE_ANSWER
      }
    ],
    relatedProducts: ['Nebula Series Bundle', 'Nebula Space', 'Nebula Rift']
  },
  'Nebula Space': {
    title: 'Nebula Space Support',
    description: 'Atmospheric reverb for depth, motion, and cinematic space shaping.',
    requirements: STANDARD_NEBULA_PLUGIN_REQUIREMENTS,
    manuals: [{ label: 'Nebula Space User Manual', href: NEBULA_MANUALS.space }],
    faqs: [
      {
        question: 'How do I install it?',
        answer: PLUGIN_INSTALL_ANSWER
      },
      {
        question: 'Which plugin formats are included?',
        answer: PLUGIN_FORMAT_ANSWER
      },
      {
        question: 'What does Freeze do?',
        answer: 'Freeze holds the current ambience bed for sustained pads and transition-ready textures.'
      },
      {
        question: 'Where do I find downloads and license details?',
        answer: PRODUCT_ACCESS_ANSWER
      },
      {
        question: 'Can I use it commercially?',
        answer: PRODUCT_COMMERCIAL_USE_ANSWER
      }
    ],
    relatedProducts: ['Nebula Series Bundle', 'Nebula Drift', 'Nebula Crush']
  },
  'Nebula Drift': {
    title: 'Nebula Drift Support',
    description: 'Fluid modulation for movement, phase-like drift, and cinematic spatial motion.',
    requirements: STANDARD_NEBULA_PLUGIN_REQUIREMENTS,
    manuals: [{ label: 'Nebula Drift User Manual', href: NEBULA_MANUALS.drift }],
    faqs: [
      {
        question: 'How do I install it?',
        answer: PLUGIN_INSTALL_ANSWER
      },
      {
        question: 'Which plugin formats are included?',
        answer: PLUGIN_FORMAT_ANSWER
      },
      {
        question: 'Where do I find downloads and license details?',
        answer: PRODUCT_ACCESS_ANSWER
      },
      {
        question: 'Can I use it commercially?',
        answer: PRODUCT_COMMERCIAL_USE_ANSWER
      }
    ],
    relatedProducts: ['Nebula Series Bundle', 'Nebula Space', 'Nebula Rift']
  },
  'Nebula Rift': {
    title: 'Nebula Rift Support',
    description: 'Experimental granular fracture for destructive texture, elastic tone motion, and cinematic rift worlds.',
    requirements: RIFT_REQUIREMENTS,
    manuals: [{ label: 'Nebula Rift User Manual', href: NEBULA_MANUALS.rift }],
    faqs: [
      {
        question: 'How do I install it?',
        answer: PLUGIN_INSTALL_ANSWER
      },
      {
        question: 'Which plugin formats are included?',
        answer: PLUGIN_FORMAT_ANSWER
      },
      {
        question: 'What should I do if it does not appear in my DAW?',
        answer: 'Rescan plugins in the DAW. If it is still missing, clear the host plugin cache and run a full rescan.'
      },
      {
        question: 'How do presets behave?',
        answer: 'Nebula Rift includes 15 curated presets grouped by mode. Preset selection recalls the sound-shaping controls, while Mix intentionally stays where you set it.'
      },
      {
        question: 'Where do I find downloads and license details?',
        answer: PRODUCT_ACCESS_ANSWER
      },
      {
        question: 'Can I use it commercially?',
        answer: PRODUCT_COMMERCIAL_USE_ANSWER
      }
    ],
    relatedProducts: ['Nebula Series Bundle', 'Nebula Crush', 'Nebula Drift']
  },
  'Organic Series Bundle': {
    title: 'Organic Series Bundle Support',
    description: 'Compatibility notes and manuals for all three Organic Series plugins.',
    requirements: [
      {
        label: 'Included Plugins',
        items: ['Jeju Citrus Air', 'Boseong Green Tea', 'Uiseong Garlic']
      },
      ...ORGANIC_COMPATIBILITY_REQUIREMENTS
    ],
    manuals: [
      { label: 'Jeju Citrus Air User Manual', href: ORGANIC_MANUALS.jeju },
      { label: 'Boseong Green Tea User Manual', href: ORGANIC_MANUALS.boseong },
      { label: 'Uiseong Garlic User Manual', href: ORGANIC_MANUALS.uiseong }
    ],
    faqs: [
      {
        question: 'What is included in the Organic Series Bundle?',
        answer: 'The bundle includes Jeju Citrus Air, Boseong Green Tea, and Uiseong Garlic.'
      },
      {
        question: 'Which plugin formats are included?',
        answer: ORGANIC_FORMAT_ANSWER
      },
      {
        question: 'How do I install the Organic Series plugins?',
        answer: ORGANIC_INSTALL_ANSWER
      },
      {
        question: 'Where do I find downloads and license details?',
        answer: ORGANIC_ACCESS_ANSWER
      },
      {
        question: 'How does license activation work?',
        answer: ORGANIC_LICENSE_ANSWER
      },
      {
        question: 'Where can I find the user manuals?',
        answer: 'Use the Download User Manuals (PDF) menu near the purchase controls at the top of this page. Each included plugin has its own manual.'
      }
    ],
    relatedProducts: ['Jeju Citrus Air', 'Boseong Green Tea', 'Uiseong Garlic']
  },
  'Jeju Citrus Air': {
    title: 'Jeju Citrus Air Support',
    description: 'Compatibility, control guidance, and the product manual.',
    requirements: ORGANIC_PLUGIN_REQUIREMENTS,
    manuals: [{ label: 'Jeju Citrus Air User Manual', href: ORGANIC_MANUALS.jeju }],
    faqs: [
      {
        question: 'Which plugin formats are included?',
        answer: ORGANIC_FORMAT_ANSWER
      },
      {
        question: 'How do I install Jeju Citrus Air?',
        answer: ORGANIC_INSTALL_ANSWER
      },
      {
        question: 'Where do I find my download and license?',
        answer: ORGANIC_ACCESS_ANSWER
      },
      {
        question: 'How does license activation work?',
        answer: ORGANIC_LICENSE_ANSWER
      },
      {
        question: 'When should I choose Vocal instead of Ambient?',
        answer: 'Use Vocal when the source needs to stay forward and easy to locate. Use Ambient for a wider, longer late field. If the effect pushes the source farther back than intended, switch to Vocal before reducing every control.'
      },
      {
        question: 'Why does Mix stay unchanged when I load a preset?',
        answer: 'Presets recall Vocal or Ambient mode plus Peel, Shine, Glow, and Juice. Mix stays unchanged so you can audition character without losing the dry/wet balance you set for the track.'
      },
      {
        question: 'How do I set the final output level?',
        answer: 'Jeju Citrus Air has no separate Output control. On an insert, set Mix for the blend you want and adjust the DAW channel or a following gain stage. On a send or return, set Mix to 100% and control the effect level with the return fader.'
      },
      {
        question: 'Where can I find the user manual?',
        answer: ORGANIC_MANUAL_ANSWER
      }
    ],
    relatedProducts: ['Organic Series Bundle', 'Boseong Green Tea', 'Uiseong Garlic']
  },
  'Boseong Green Tea': {
    title: 'Boseong Green Tea Support',
    description: 'Compatibility, control guidance, and the product manual.',
    requirements: ORGANIC_PLUGIN_REQUIREMENTS,
    manuals: [{ label: 'Boseong Green Tea User Manual', href: ORGANIC_MANUALS.boseong }],
    faqs: [
      {
        question: 'Which plugin formats are included?',
        answer: ORGANIC_FORMAT_ANSWER
      },
      {
        question: 'How do I install Boseong Green Tea?',
        answer: ORGANIC_INSTALL_ANSWER
      },
      {
        question: 'Where do I find my download and license?',
        answer: ORGANIC_ACCESS_ANSWER
      },
      {
        question: 'How does license activation work?',
        answer: ORGANIC_LICENSE_ANSWER
      },
      {
        question: 'Does Auto prevent clipping?',
        answer: 'No. Auto provides Grow-dependent level assistance; it does not move Output and is not a limiter or peak protector. Level-match with Output and watch your DAW peak meter, especially with a hot input or positive Output setting.'
      },
      {
        question: 'Why do Output and Auto stay unchanged when I load a preset?',
        answer: 'Presets recall Grow, Body, Focus, and Air. Output and Auto remain unchanged so your level match and Auto preference stay consistent while you audition character.'
      },
      {
        question: 'Where can I find the user manual?',
        answer: ORGANIC_MANUAL_ANSWER
      }
    ],
    relatedProducts: ['Organic Series Bundle', 'Jeju Citrus Air', 'Uiseong Garlic']
  },
  'Uiseong Garlic': {
    title: 'Uiseong Garlic Support',
    description: 'Compatibility, control guidance, and the product manual.',
    requirements: ORGANIC_PLUGIN_REQUIREMENTS,
    manuals: [{ label: 'Uiseong Garlic User Manual', href: ORGANIC_MANUALS.uiseong }],
    faqs: [
      {
        question: 'Which plugin formats are included?',
        answer: ORGANIC_FORMAT_ANSWER
      },
      {
        question: 'How do I install Uiseong Garlic?',
        answer: ORGANIC_INSTALL_ANSWER
      },
      {
        question: 'Where do I find my download and license?',
        answer: ORGANIC_ACCESS_ANSWER
      },
      {
        question: 'How does license activation work?',
        answer: ORGANIC_LICENSE_ANSWER
      },
      {
        question: 'Why do Attack, Forward, and Tight have little effect at Bite 0%?',
        answer: 'Bite sets the total Definition amount. At 0%, there is no meaningful Definition for those controls to shape. Set Bite first, then refine onset, placement, and post-onset control.'
      },
      {
        question: 'How are Attack and Forward different?',
        answer: 'Attack shapes the first edge from soft to crisp. Forward changes front-to-back placement and midrange articulation. Neither control is a simple level boost.'
      },
      {
        question: 'Why does Output stay unchanged when I load a preset?',
        answer: 'Presets recall Bite, Attack, Forward, and Tight. Output remains independent so your level-matched comparison stays in place.'
      },
      {
        question: 'Where can I find the user manual?',
        answer: ORGANIC_MANUAL_ANSWER
      }
    ],
    relatedProducts: ['Organic Series Bundle', 'Jeju Citrus Air', 'Boseong Green Tea']
  },
  'Nebula Drums': {
    title: 'Nebula Drums Support',
    description: 'A creative drum instrument built for Decent Sampler.',
    requirements: DRUMS_REQUIREMENTS,
    manuals: [{ label: 'Nebula Drums User Manual', href: NEBULA_MANUALS.drums }],
    faqs: [
      {
        question: 'What do I need before using it?',
        answer: 'Install Decent Sampler 1.11.1 or later before loading Nebula Drums. Using the latest available Decent Sampler version is recommended.'
      },
      {
        question: 'How do I load Nebula Drums?',
        answer: 'Fully unzip the download, keep the .dspreset files beside the Samples and Resources folders, load Decent Sampler on a DAW instrument track, then open a .dspreset from the FILE… menu.'
      },
      {
        question: 'Where do I find downloads and license details?',
        answer: PRODUCT_ACCESS_ANSWER
      },
      {
        question: 'Can I use it commercially?',
        answer: PRODUCT_COMMERCIAL_USE_ANSWER
      }
    ],
    relatedProducts: ['Nebula Series Bundle', 'Nebula Crush', 'Glitch Drum Pack Vol.1']
  }
};

const GLITCH_FAQ_ITEMS: FaqItem[] = [
  {
    question: 'What files are included?',
    answer: 'The pack contains 100 audio samples supplied as 24-bit / 48 kHz WAV files.'
  },
  {
    question: 'Which DAWs can use the pack?',
    answer: 'The WAV files can be used in any DAW or host that imports 24-bit / 48 kHz WAV audio.'
  },
  {
    question: 'Where do I find my download?',
    answer: PRODUCT_ACCESS_ANSWER
  },
  {
    question: 'Can I use the samples commercially?',
    answer: 'Yes. The FarmVerb EULA permits use in personal and commercial projects, including music releases, games, films, broadcasts, and live performances.'
  },
  {
    question: 'Can I redistribute the raw sample files?',
    answer: 'No. The raw samples may not be redistributed, resold, shared, or repackaged as standalone files or as another sample library.'
  }
];

const BUNDLE_INCLUDED_PRODUCT_NAMES = [
  'Nebula Crush',
  'Nebula Space',
  'Nebula Drift',
  'Nebula Rift',
  'Nebula Drums'
] as const;

const ORGANIC_BUNDLE_INCLUDED_PRODUCT_NAMES = [
  'Jeju Citrus Air',
  'Boseong Green Tea',
  'Uiseong Garlic'
] as const;

const GLITCH_RELATED_PRODUCT_NAMES = [
  'Nebula Series Bundle',
  'Nebula Crush',
  'Nebula Drums'
] as const;

function getHomeProductCard(productName: string) {
  return PRODUCT_CARD_CATALOG.find((card) => card.productName === productName || card.name === productName) ?? null;
}

function getRelatedProductCards(productNames: readonly string[], currentProductName?: string) {
  const normalizedCurrentProductName = currentProductName?.trim().toLowerCase();

  return productNames
    .map((productName) => getHomeProductCard(productName))
    .filter((card): card is HomeFeatureCard => Boolean(card))
    .filter((card) => card.productName.trim().toLowerCase() !== normalizedCurrentProductName);
}

function getProductSupportId(productName: string) {
  return `support-${productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

function FaqAccordion({ items }: { items: FaqItem[] }) {
  return (
    <div className="product-faq-list">
      {items.map((item) => (
        <details key={item.question} className="product-faq-item">
          <summary>
            <span>{item.question}</span>
          </summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

function NebulaDrumsLoadSection() {
  const loadSteps = [
    {
      title: 'Install Decent Sampler',
      body: 'Download and install Decent Sampler 1.11.1 or later. The latest available version is recommended.'
    },
    {
      title: 'Unzip the complete download',
      body: 'Fully extract the Nebula Drums ZIP before opening any preset.'
    },
    {
      title: 'Keep the folders together',
      body: 'Keep the .dspreset files beside the Samples and Resources folders. The presets use this relative folder structure.'
    },
    {
      title: 'Create an instrument track',
      body: 'Open your DAW and add a new software instrument or instrument track.'
    },
    {
      title: 'Load Decent Sampler',
      body: 'Insert Decent Sampler as the instrument on the track.'
    },
    {
      title: 'Open the first preset',
      body: 'In Decent Sampler, choose FILE… and open 01 Hybrid Kinetic Drums.dspreset from the extracted Nebula Drums folder.'
    },
    {
      title: 'Explore the collection',
      body: 'Open the other .dspreset files from the same folder to explore the remaining Nebula Drums sounds.'
    }
  ] as const;

  return (
    <section className="product-load-section" aria-labelledby="nebula-drums-load-title">
      <div className="product-section-kicker">
        <p className="section-overline">Getting Started</p>
        <h3 id="nebula-drums-load-title">How to Load Nebula Drums</h3>
        <p className="product-load-intro">
          Nebula Drums is a Decent Sampler instrument, not a standalone VST, AU, or AAX plug-in. Follow these steps
          after downloading the product.
        </p>
        <a
          className="product-load-link"
          href="https://www.decentsamples.com/product/decent-sampler-plugin/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Download Decent Sampler
        </a>
      </div>
      <ol className="product-load-steps">
        {loadSteps.map((step, index) => (
          <li key={step.title} className="product-load-step">
            <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <h4>{step.title}</h4>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ExploreMoreProductsSection({
  cards,
  onAddToCart,
  onBuyNow,
  hasCheckoutUrl,
  getBuyLabel
}: {
  cards: HomeFeatureCard[];
  onAddToCart: (productName: string) => void;
  onBuyNow: (productName: string) => void;
  hasCheckoutUrl: (productName: string) => boolean;
  getBuyLabel: (productName: string) => string;
}) {
  if (cards.length === 0) {
    return null;
  }

  return (
    <section className="product-related-section" aria-label="Explore more FarmVerb products">
      <div className="product-section-kicker">
        <p className="section-overline">More from FarmVerb</p>
        <h3>Explore More Products</h3>
      </div>
      <div className="related-product-grid">
        {cards.map((card) => {
          const checkoutReady = hasCheckoutUrl(card.productName);

          return (
            <article key={card.name} className="related-product-card interactive-tilt">
              <figure className="related-product-media">
                <img src={card.image} alt={card.name} />
              </figure>
              <div className="related-product-copy">
                <p className="home-product-eyebrow">{card.eyebrow}</p>
                <h4>{card.name}</h4>
                <p>{card.description}</p>
                <ProductPrice productName={card.productName} />
              </div>
              <div className={checkoutReady ? 'related-product-actions' : 'related-product-actions is-view-only'}>
                <Link
                  href={card.href}
                  className="plugin-action plugin-action-cart"
                  data-route={card.route}
                  data-plugin-section={card.pluginSection}
                >
                  View
                </Link>
                {checkoutReady ? (
                  <>
                    <button
                      type="button"
                      className="plugin-action plugin-action-buy"
                      onClick={() => onBuyNow(card.productName)}
                    >
                      {getBuyLabel(card.productName)}
                    </button>
                    <button
                      type="button"
                      className="plugin-action plugin-action-cart"
                      onClick={() => onAddToCart(card.productName)}
                    >
                      Add to Cart
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ProductCommercialSections({
  details,
  manuals,
  onAddToCart,
  onBuyNow,
  hasCheckoutUrl,
  getBuyLabel
}: {
  details: ProductCommercialDetails;
  manuals: ManualDownloadItem[];
  onAddToCart: (productName: string) => void;
  onBuyNow: (productName: string) => void;
  hasCheckoutUrl: (productName: string) => boolean;
  getBuyLabel: (productName: string) => string;
}) {
  const checkoutReady = hasCheckoutUrl(details.productName);
  const primaryManual = manuals[0] ?? null;
  const youtubeVideoId = getProductYoutubeVideoId(details.productName);
  const isOrganicBundle = details.productName === 'Organic Series Bundle';
  const isOrganicProduct = isOrganicProductName(details.productName);

  return (
    <section className="product-commercial-stack" aria-label={`${details.eyebrow} product story`}>
      <section className={`product-story-stage product-story-stage-${details.imageLayout}`}>
        <div className="product-story-copy">
          <p className="section-overline">{details.eyebrow}</p>
          <h2>{details.headline}</h2>
          <p className="product-story-subhead">{details.subhead}</p>
          <p className="product-story-body">{details.body}</p>
          <div className="product-story-commerce">
            <ProductPrice productName={details.productName} className="product-story-price" />
            {checkoutReady || isOrganicProduct ? (
              <div className="product-story-actions">
                <button
                  type="button"
                  className="plugin-action plugin-action-cart"
                  onClick={() => onAddToCart(details.productName)}
                >
                  Add to Cart
                </button>
                <button
                  type="button"
                  className="plugin-action plugin-action-buy"
                  onClick={() => onBuyNow(details.productName)}
                  disabled={!checkoutReady}
                  title={checkoutReady ? undefined : 'Checkout link coming soon'}
                >
                  {getBuyLabel(details.productName)}
                </button>
              </div>
            ) : null}
            {isOrganicProduct && !checkoutReady ? (
              <span className="checkout-coming-soon">Checkout link coming soon</span>
            ) : null}
            {manuals.length === 1 && primaryManual ? (
              <a
                href={primaryManual.href}
                className="product-story-manual-action"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span aria-hidden="true">📖</span>
                Download User Manual (PDF)
              </a>
            ) : null}
            {manuals.length > 1 ? (
              <details className="product-story-manual-group">
                <summary>
                  <span aria-hidden="true">📖</span>
                  Download User Manuals (PDF)
                </summary>
                <div className="product-story-manual-list">
                  {manuals.map((manual) => (
                    <a key={manual.href} href={manual.href} target="_blank" rel="noopener noreferrer">
                      {manual.label}
                    </a>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </div>
        <figure
          className={`product-story-media product-story-media-${details.imageLayout} ${
            details.galleryImages && details.galleryImages.length > 1 ? 'product-story-media-gallery' : ''
          } ${isOrganicBundle ? 'product-story-media-organic-bundle' : ''} interactive-tilt`}
        >
          {details.galleryImages && details.galleryImages.length > 1 ? (
            <div className="product-story-gallery-grid">
              {details.galleryImages.map((image, index) => (
                <img key={image} src={image} alt={`${details.imageAlt}, view ${index + 1}`} />
              ))}
            </div>
          ) : (
            <img src={details.image} alt={details.imageAlt} />
          )}
        </figure>
      </section>

      {details.productName === 'Nebula Series Bundle' ? (
        <BundleVideoTabsSection />
      ) : youtubeVideoId ? (
        <section className="product-demo-section" aria-label={`${details.productName} demo video`}>
          <div className="product-section-kicker">
            <p className="section-overline">Product Demo</p>
            <h3>{details.productName} in motion.</h3>
          </div>
          <YouTubeDemo videoId={youtubeVideoId} title={`${details.productName} product demo`} />
        </section>
      ) : null}

      <div className="product-value-row" aria-label="Product highlights">
        {details.valueItems.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>

      <section className="product-feature-section">
        <div className="product-section-kicker">
          <p className="section-overline">Sound Design</p>
          <h3>Built around the controls that shape the sound.</h3>
        </div>
        <div className="product-feature-grid">
          {details.features.map((feature) => (
            <article key={feature.title} className="product-feature-card">
              <h4>{feature.title}</h4>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="product-workflow-panel">
        <div className="product-section-kicker">
          <p className="section-overline">Workflow</p>
          <h3>Create. Shape. Finish.</h3>
        </div>
        <div className="product-workflow-grid">
          {details.workflow.map((step, index) => (
            <article key={step.title} className="product-workflow-step">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h4>{step.title}</h4>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      {details.productName === 'Nebula Drums' ? <NebulaDrumsLoadSection /> : null}

      {details.productName === 'Nebula Series Bundle' ? (
        <BundleContentsSection />
      ) : details.productName === 'Organic Series Bundle' ? (
        <OrganicBundleContentsSection />
      ) : null}
    </section>
  );
}

function ProductSupportSections({
  details,
  supportId
}: {
  details: ProductSupportDetails;
  supportId: string;
}) {
  return (
    <section id={supportId} className="product-support-stack" aria-label={`${details.title} technical information`}>
      <div className="product-support-head">
        <p className="section-overline">Technical Details</p>
        <h2>Support resources</h2>
        <p>Compatibility notes and FAQ are collected here for setup and reference.</p>
      </div>

      <section className="product-support-panel">
        <div className="product-support-panel-head">
          <p className="section-overline">System Requirements</p>
          <h3>Compatibility and formats</h3>
        </div>
        <dl className="product-requirement-grid">
          {details.requirements.map((group) => (
            <div key={group.label} className="product-requirement-item">
              <dt>{group.label}</dt>
              <dd>
                {group.items.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="product-support-panel">
        <div className="product-support-panel-head">
          <p className="section-overline">FAQ</p>
          <h3>Quick answers</h3>
        </div>
        <FaqAccordion items={details.faqs} />
        <div className="product-faq-contact">
          <p>Still have questions?</p>
          <a href="mailto:support@farmverb.com">support@farmverb.com</a>
          <a href="mailto:support@farmverb.com" className="manual-download-link">
            Contact Support
          </a>
        </div>
      </section>
    </section>
  );
}

function BundleVideoTabsSection() {
  const includedCards = getRelatedProductCards(BUNDLE_INCLUDED_PRODUCT_NAMES);
  const [activeProductName, setActiveProductName] = useState<string>(BUNDLE_INCLUDED_PRODUCT_NAMES[0]);
  const activeIndex = Math.max(
    0,
    includedCards.findIndex((card) => card.name === activeProductName)
  );
  const activeCard = includedCards[activeIndex] ?? includedCards[0] ?? null;
  const activeVideoId = activeCard ? getProductYoutubeVideoId(activeCard.productName) : null;

  const selectProductDemo = (productName: string) => {
    if (productName === activeProductName) {
      return;
    }

    pauseAllYouTubePlayers();
    setActiveProductName(productName);
  };

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    let nextIndex = index;

    if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + includedCards.length) % includedCards.length;
    } else if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % includedCards.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = includedCards.length - 1;
    }

    const nextCard = includedCards[nextIndex];
    if (!nextCard) {
      return;
    }

    selectProductDemo(nextCard.name);
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    window.requestAnimationFrame(() => tabs?.[nextIndex]?.focus());
  };

  return (
    <section className="bundle-includes-section bundle-video-tabs-section" aria-label="Nebula Series product demos">
      <div className="bundle-demo-tabs" role="tablist" aria-label="Nebula Series product demos">
        {includedCards.map((card, index) => {
          const isActive = card.name === activeCard?.name;

          return (
            <button
              key={card.name}
              id={`bundle-demo-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="bundle-demo-panel"
              tabIndex={isActive ? 0 : -1}
              className={`bundle-demo-tab ${isActive ? 'is-active' : ''}`}
              onClick={() => selectProductDemo(card.name)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {card.name}
            </button>
          );
        })}
      </div>

      {activeCard && activeVideoId ? (
        <article
          id="bundle-demo-panel"
          className="bundle-demo-panel"
          role="tabpanel"
          aria-labelledby={`bundle-demo-tab-${activeIndex}`}
        >
          <YouTubeDemo videoId={activeVideoId} title={`${activeCard.name} product demo`} />
          <div className="bundle-demo-copy">
            <figure className="bundle-demo-artwork">
              <img src={activeCard.image} alt="" />
            </figure>
            <p className="section-overline">{activeCard.eyebrow}</p>
            <h3>{activeCard.name}</h3>
            <p>{activeCard.description}</p>
            <Link
              href={activeCard.href}
              className="plugin-action plugin-action-cart"
              data-route={activeCard.route}
              data-plugin-section={activeCard.pluginSection}
            >
              View {activeCard.name}
            </Link>
          </div>
        </article>
      ) : null}
    </section>
  );
}

function BundleContentsSection() {
  const includedCards = getRelatedProductCards(BUNDLE_INCLUDED_PRODUCT_NAMES);

  return (
    <section className="bundle-includes-section" aria-label="Nebula Series Bundle contents">
      <div className="product-support-head">
        <p className="section-overline">Bundle Includes</p>
        <h2>Four Nebula effects plus Nebula Drums as a bonus.</h2>
        <p>Nebula Series Bundle includes the core effect devices and the Decent Sampler drum instrument as a bonus.</p>
      </div>
      <div className="bundle-includes-grid">
        {includedCards.map((card) => (
          <article key={card.name} className="bundle-include-card">
            <figure>
              <img src={card.image} alt={card.name} />
            </figure>
            <div>
              <p>{card.eyebrow}</p>
              <h3>{card.name}</h3>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function OrganicBundleContentsSection() {
  const includedCards = getRelatedProductCards(ORGANIC_BUNDLE_INCLUDED_PRODUCT_NAMES);

  return (
    <section className="bundle-includes-section organic-bundle-includes" aria-label="Organic Series Bundle contents">
      <div className="product-support-head">
        <p className="section-overline">Bundle Includes</p>
        <h2>Three Organic Series plugins, each with a distinct purpose.</h2>
        <p>Move from airy space to focused richness and forward definition, then open any product for its full workflow and manual.</p>
      </div>
      <div className="bundle-includes-grid organic-bundle-includes-grid">
        {includedCards.map((card) => (
          <article key={card.name} className="bundle-include-card organic-bundle-include-card">
            <Link
              href={card.href}
              className="organic-bundle-include-link"
              data-route={card.route}
              data-plugin-section={card.pluginSection}
            >
              <figure>
                <img src={card.image} alt={card.name} />
              </figure>
              <div>
                <p>{card.eyebrow}</p>
                <h3>{card.name}</h3>
                <span>View plugin</span>
              </div>
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function FarmVerbSite() {
  const [currentRoute, setCurrentRoute] = useState<RouteKey>('home');
  const [activePluginSection, setActivePluginSection] = useState<PluginSectionKey>(DEFAULT_PLUGIN_SECTION);
  const cartPreviewRef = useRef<HTMLDivElement | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartUserId, setCartUserId] = useState<string | null>(null);
  const [cartAuthReady, setCartAuthReady] = useState(false);
  const [buyNowNotice, setBuyNowNotice] = useState<string | null>(null);
  const [cartPreviewOpen, setCartPreviewOpen] = useState(false);
  const [cartFeedback, setCartFeedback] = useState<{ message: string; item: CartItem | null } | null>(null);

  useEffect(() => {
    return initFarmVerbSite();
  }, []);

  useEffect(() => {
    const syncFromLocation = () => {
      const { route, pluginSection } = getRouteStateFromLocation(window.location.pathname, window.location.search);
      setCurrentRoute(route);
      setActivePluginSection(pluginSection);
    };

    const onRouteChange = (event: Event) => {
      const detail = (event as CustomEvent<{ route?: RouteKey; pluginSection?: PluginSectionKey }>).detail;
      if (!detail?.route) {
        return;
      }

      setCurrentRoute(detail.route);
      setActivePluginSection(detail.pluginSection ?? DEFAULT_PLUGIN_SECTION);
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
    if (!ACCOUNT_UI_ENABLED) {
      setCartAuthReady(true);
      return;
    }

    const supabase = createBrowserSupabaseClient();
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) {
        return;
      }

      setCartUserId(data.user?.id ?? null);
      setCartAuthReady(true);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) {
        return;
      }

      setCartUserId(session?.user.id ?? null);
      setCartAuthReady(true);
      if (!session) {
        setCartItems([]);
        setCartFeedback(null);
        setCartPreviewOpen(false);
      }
    });

    const hideCartOnLogout = () => {
      setCartUserId(null);
      setCartItems([]);
      setCartFeedback(null);
      setCartPreviewOpen(false);
    };

    window.addEventListener('farmverb:auth-logout', hideCartOnLogout);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener('farmverb:auth-logout', hideCartOnLogout);
    };
  }, []);

  useEffect(() => {
    if (!cartUserId) {
      setCartItems([]);
      return;
    }

    const syncCart = () => setCartItems(getCartItems(cartUserId));
    syncCart();
    return subscribeToCart(cartUserId, syncCart);
  }, [cartUserId]);

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
    if (!cartFeedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCartFeedback(null);
      setCartPreviewOpen(false);
    }, 3200);

    return () => window.clearTimeout(timeoutId);
  }, [cartFeedback]);

  useEffect(() => {
    if (!cartPreviewOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (cartPreviewRef.current?.contains(target)) {
        return;
      }

      setCartPreviewOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [cartPreviewOpen]);

  const selectedPluginProduct = useMemo(
    () => ALL_PLUGIN_PRODUCTS.find((product) => product.section === activePluginSection) ?? NEBULA_BUNDLE_PRODUCT,
    [activePluginSection]
  );

  const visibleProducts = useMemo(() => {
    if (activePluginSection === DEFAULT_PLUGIN_SECTION) {
      return [NEBULA_BUNDLE_PRODUCT];
    }

    return selectedPluginProduct ? [selectedPluginProduct] : ALL_PLUGIN_PRODUCTS;
  }, [activePluginSection, selectedPluginProduct]);

  const glitchPackPricing = getProductPricing('Glitch Drum Pack Vol.1');
  const glitchPackPrice = glitchPackPricing ? getMainProductPrice(glitchPackPricing) : 49;
  const glitchPackRegularPrice = glitchPackPricing?.regularPrice ?? 99;
  const glitchPackYoutubeVideoId = getProductYoutubeVideoId('Glitch Drum Pack Vol.1');

  const showSeriesFeature = Boolean(selectedPluginProduct) && currentRoute === 'plugins';

  const activePluginMenuName =
    activePluginSection === DEFAULT_PLUGIN_SECTION
      ? 'Nebula Series Bundle'
      : selectedPluginProduct?.name ?? 'Nebula Series Bundle';
  const activePluginMenuCopy =
    activePluginSection === DEFAULT_PLUGIN_SECTION
      ? 'The complete Nebula bundle, prepared as a single product.'
      : `Choose the overview or jump straight into ${selectedPluginProduct?.name ?? 'this device'}.`;

  const selectPluginSection = (section: PluginSectionKey) => {
    setCurrentRoute('plugins');
    setActivePluginSection(section);
  };

  const onProductNameClick = (section: PluginSectionKey) => {
    selectPluginSection(section);
  };

  const hasCheckoutUrl = (productName: string) => Boolean(getLemonCheckoutUrlByProductName(productName));

  const renderSeriesFeature = () => {
    if (!showSeriesFeature || !selectedPluginProduct) {
      return null;
    }

    const checkoutReady = hasCheckoutUrl(selectedPluginProduct.name);

    return (
      <section className="plugin-feature-stage plugin-feature-nebula interactive-tilt" aria-label={`${selectedPluginProduct.name} detail`}>
        {selectedPluginProduct.images && selectedPluginProduct.images.length > 0 ? (
          <figure
            className={`plugin-feature-media ${
              selectedPluginProduct.images.length > 1 ? 'plugin-feature-gallery' : ''
            } ${selectedPluginProduct.name === 'Organic Series Bundle' ? 'plugin-feature-media-organic-bundle' : ''}`}
          >
            {selectedPluginProduct.images.length > 1 ? (
              <div className="plugin-feature-gallery-track">
                {selectedPluginProduct.images.map((src, index) => (
                  <div key={`${selectedPluginProduct.name}-${src}`} className="plugin-feature-slide">
                    <img src={src} alt={`${selectedPluginProduct.name} interface view ${index + 1}`} />
                  </div>
                ))}
              </div>
            ) : (
              <img src={selectedPluginProduct.images[0]} alt={`${selectedPluginProduct.name} interface`} />
            )}
          </figure>
        ) : (
          <div className="plugin-feature-media is-empty">
            <span>Preview unavailable</span>
          </div>
        )}

        <div className="plugin-feature-copy">
          <h3>{selectedPluginProduct.name}</h3>
          <p>{selectedPluginProduct.description}</p>
          <ProductPrice productName={selectedPluginProduct.name} />
          <div className="plugin-feature-actions">
            <button
              type="button"
              className="plugin-action plugin-action-cart"
              onClick={() => void addToCart(selectedPluginProduct.name)}
            >
              Add to Cart
            </button>
            <button
              type="button"
              className="plugin-action plugin-action-buy"
              onClick={() => onBuyNow(selectedPluginProduct.name)}
              disabled={!checkoutReady}
              title={checkoutReady ? undefined : 'Checkout link coming soon'}
            >
              {getPlaceholderBuyLabel(selectedPluginProduct.name)}
            </button>
            {!checkoutReady ? <span className="checkout-coming-soon">Checkout link coming soon</span> : null}
          </div>
        </div>
      </section>
    );
  };

  const renderSeriesGrid = () => (
    <div className="plugin-grid plugin-grid-nebula" role="list" aria-label="Nebula Series products">
      {visibleProducts.map((product) => {
        const checkoutReady = hasCheckoutUrl(product.name);

        return (
          <article
            key={product.name}
            className="plugin-card plugin-card-nebula interactive-tilt"
            role="listitem"
            tabIndex={0}
          >
            {product.images && product.images.length > 0 ? (
              <figure className="plugin-card-media">
                <img src={product.images[0]} alt={`${product.name} interface`} />
              </figure>
            ) : (
              <div className="plugin-card-media is-empty">
                <span>Preview unavailable</span>
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
            </div>

            <div className="plugin-card-actions">
              <button
                type="button"
                className="plugin-action plugin-action-cart"
                onClick={() => void addToCart(product.name)}
              >
                Add to Cart
              </button>
              <button
                type="button"
                className="plugin-action plugin-action-buy"
                onClick={() => onBuyNow(product.name)}
                disabled={!checkoutReady}
                title={checkoutReady ? undefined : 'Checkout link coming soon'}
              >
                {getPlaceholderBuyLabel(product.name)}
              </button>
              {!checkoutReady ? <span className="checkout-coming-soon">Checkout link coming soon</span> : null}
            </div>
          </article>
        );
      })}
    </div>
  );

  const renderSeriesContent = () => {
    if (showSeriesFeature) {
      return renderSeriesFeature();
    }

    return renderSeriesGrid();
  };

  const cartItemCount = useMemo(() => getCartItemCount(cartItems), [cartItems]);
  const lemonMyOrdersUrl = getLemonMyOrdersUrl();

  const redirectToLogin = () => {
    const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(`/login?redirect=${encodeURIComponent(returnPath)}`);
  };

  const addToCart = async (productName: string) => {
    let userId = cartUserId;

    if (!userId && ACCOUNT_UI_ENABLED) {
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();
        userId = user?.id ?? null;
        if (userId) {
          setCartUserId(userId);
          setCartAuthReady(true);
        }
      } catch {
        userId = null;
      }
    }

    if (!userId) {
      redirectToLogin();
      return;
    }

    const catalogProduct = getCatalogProductByName(productName);
    const normalizedName = productName.trim().toLowerCase();
    const existing = getCartItems(userId).some((item) =>
      catalogProduct ? item.slug === catalogProduct.slug : item.name.trim().toLowerCase() === normalizedName
    );
    const nextCart = addItemToCart(userId, productName);
    const addedItem =
      nextCart.find((item) =>
        catalogProduct ? item.slug === catalogProduct.slug : item.name.trim().toLowerCase() === normalizedName
      ) ?? null;

    setCartItems(nextCart);
    setCartFeedback({ message: existing ? 'Already in cart' : 'Added to cart', item: addedItem });
    setCartPreviewOpen(true);
  };

  const onBuyNow = (productName: string) => {
    const checkoutUrl = getLemonCheckoutUrlByProductName(productName);

    if (!checkoutUrl) {
      setBuyNowNotice('Checkout link coming soon.');
      return;
    }

    window.location.assign(checkoutUrl);
  };

  const getPlaceholderBuyLabel = (productName: string) => getLemonBuyButtonLabel(productName);

  const renderProductCommercial = (productName: string) => {
    const details = PRODUCT_COMMERCIAL_DETAILS[productName];
    const supportDetails = PRODUCT_SUPPORT_DETAILS[productName];

    if (!details) {
      return null;
    }

    return (
      <ProductCommercialSections
        details={details}
        manuals={supportDetails?.manuals ?? []}
        onAddToCart={addToCart}
        onBuyNow={onBuyNow}
        hasCheckoutUrl={hasCheckoutUrl}
        getBuyLabel={getPlaceholderBuyLabel}
      />
    );
  };

  const renderExploreMoreProducts = (
    currentProductName: string,
    relatedProductNames?: readonly string[]
  ) => {
    const productNames = relatedProductNames ?? PRODUCT_COMMERCIAL_DETAILS[currentProductName]?.relatedProducts ?? [];
    const cards = getRelatedProductCards(productNames, currentProductName);

    return (
      <ExploreMoreProductsSection
        cards={cards}
        onAddToCart={addToCart}
        onBuyNow={onBuyNow}
        hasCheckoutUrl={hasCheckoutUrl}
        getBuyLabel={getPlaceholderBuyLabel}
      />
    );
  };

  const renderProductSupport = (productName: string) => {
    const details = PRODUCT_SUPPORT_DETAILS[productName];

    if (!details) {
      return null;
    }

    return (
      <ProductSupportSections details={details} supportId={getProductSupportId(productName)} />
    );
  };

  return (
    <div className="farmverb-root">
      <div className="grain-layer" aria-hidden="true" />

      <header className="site-header">
        <nav className="site-nav site-nav-desktop site-container" aria-label="Primary navigation">
          <div className="nav-group nav-left">
            <Link href="/instrument" className="nav-link" data-route="instrument">
              Software Instrument
            </Link>
            <AudioPluginsMegaMenu
              currentRoute={currentRoute}
              activePluginSection={activePluginSection}
            />
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
            {cartAuthReady && cartUserId ? (
              <div className={`cart-nav-wrap ${cartPreviewOpen ? 'is-open' : ''}`} ref={cartPreviewRef}>
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

                {cartPreviewOpen && cartFeedback ? (
                  <div className="mini-cart-popover" role="status" aria-live="polite">
                    <p className="mini-cart-status">{cartFeedback.message}</p>
                    {cartFeedback.item ? (
                      <div className="mini-cart-line">
                        {cartFeedback.item.image ? <img src={cartFeedback.item.image} alt="" /> : null}
                        <div>
                          <strong>{cartFeedback.item.name}</strong>
                          <span>{cartFeedback.item.description}</span>
                        </div>
                      </div>
                    ) : null}
                    <Link href="/cart" className="mini-cart-link">
                      View Cart
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}
            <AuthNav />
          </div>
        </nav>
        <MobileSiteNavigation
          currentRoute={currentRoute}
          activePluginSection={activePluginSection}
          showCart={cartAuthReady && Boolean(cartUserId)}
          cartItemCount={cartItemCount}
        />
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
                {HOME_PRODUCT_GRID_CARDS.map((card) => {
                  const isOrganicCard = isOrganicProductName(card.productName);
                  const checkoutReady = hasCheckoutUrl(card.productName);

                  return (
                    <article
                      key={card.name}
                      className={`home-product-card interactive-tilt ${isOrganicCard ? 'home-product-card-organic' : ''}`}
                    >
                      <figure className="home-product-media">
                        <img src={card.image} alt={card.name} />
                      </figure>

                      <div className="home-product-copy">
                        <p className="home-product-eyebrow">{card.eyebrow}</p>
                        <h3>
                          {isOrganicCard ? (
                            <Link
                              href={card.href}
                              className="home-product-title-link"
                              data-route={card.route}
                              data-plugin-section={card.pluginSection}
                            >
                              {card.name}
                            </Link>
                          ) : (
                            card.name
                          )}
                        </h3>
                        <p>{card.description}</p>
                        <ProductPrice productName={card.productName} className="home-product-price" />
                      </div>

                      <div className="home-product-actions">
                        {isOrganicCard ? (
                          <button
                            type="button"
                            className="section-action-btn section-action-buy"
                            onClick={() => onBuyNow(card.productName)}
                            disabled={!checkoutReady}
                            title={checkoutReady ? undefined : 'Checkout link coming soon'}
                          >
                            {getPlaceholderBuyLabel(card.productName)}
                          </button>
                        ) : (
                          <Link
                            href={card.href}
                            className="section-action-btn section-action-buy home-product-link"
                            data-route={card.route}
                            data-plugin-section={card.pluginSection}
                          >
                            {card.ctaLabel}
                          </Link>
                        )}
                        <button
                          type="button"
                          className="section-action-btn section-action-cart"
                          onClick={() => void addToCart(card.productName)}
                        >
                          Add to Cart
                        </button>
                      </div>
                      {isOrganicCard && !checkoutReady ? (
                        <span className="checkout-coming-soon home-product-checkout-status">
                          Checkout link coming soon
                        </span>
                      ) : null}
                    </article>
                  );
                })}
              </div>
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
            <section className="plugin-series-view plugin-landing-view">
              {renderProductCommercial(activePluginMenuName)}
              {renderProductSupport(activePluginMenuName)}
              {renderExploreMoreProducts(activePluginMenuName)}
            </section>

            <div className="global-footer-host">
              <GlobalFooter />
            </div>
          </div>
        </section>

        <section className="page page-instrument" data-page="instrument" aria-hidden="true">
          <div className="page-scroll page-shell site-container">
            {renderProductCommercial('Nebula Drums')}
            {renderProductSupport('Nebula Drums')}
            {renderExploreMoreProducts('Nebula Drums')}

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
                      onClick={() => void addToCart('Glitch Drum Pack Vol.1')}
                    >
                      Add to Cart
                    </button>
                    <button
                      type="button"
                      className="section-action-btn section-action-buy"
                      onClick={() => onBuyNow('Glitch Drum Pack Vol.1')}
                      disabled={!hasCheckoutUrl('Glitch Drum Pack Vol.1')}
                      title={hasCheckoutUrl('Glitch Drum Pack Vol.1') ? undefined : 'Checkout link coming soon'}
                    >
                      {getPlaceholderBuyLabel('Glitch Drum Pack Vol.1')}
                    </button>
                    {!hasCheckoutUrl('Glitch Drum Pack Vol.1') ? (
                      <span className="checkout-coming-soon">Checkout link coming soon</span>
                    ) : null}
                  </div>
                </div>

                <figure className="pack-art interactive-tilt sample-hero-art sample-hero-cover">
                  <img src="/GlitchDrum/GlitchDrum.png" alt="Glitch Drum Pack artwork" />
                </figure>
              </div>

              <section className="sample-panel-section sample-film-section">
                <p className="section-overline">Product Film</p>
                {glitchPackYoutubeVideoId ? (
                  <YouTubeDemo
                    videoId={glitchPackYoutubeVideoId}
                    title="Glitch Drum Pack Vol. I product film"
                    className="sample-film-card sample-film-youtube"
                  />
                ) : null}
                <p className="sample-film-caption">Fractured rhythm. Digital texture. Controlled chaos.</p>
              </section>

              <section className="sample-value-strip" aria-label="Product facts">
                {GLITCH_VALUE_STRIP.map((item) => (
                  <div key={item} className="sample-value-item">
                    {item}
                  </div>
                ))}
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

              <section className="sample-panel-section">
                <p className="section-overline">FAQ</p>
                <article className="sample-spec-card sample-spec-card-wide">
                  <FaqAccordion items={GLITCH_FAQ_ITEMS} />
                  <div className="product-faq-contact">
                    <p>Still have questions?</p>
                    <a href="mailto:support@farmverb.com">support@farmverb.com</a>
                    <a href="mailto:support@farmverb.com" className="manual-download-link">
                      Contact Support
                    </a>
                  </div>
                </article>
              </section>

              {renderExploreMoreProducts('Glitch Drum Pack Vol.1', GLITCH_RELATED_PRODUCT_NAMES)}
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

            <div className="support-orders-panel">
              <p>Lemon Squeezy manages v1.0 orders, license keys, and downloads.</p>
              {lemonMyOrdersUrl ? (
                <a href={lemonMyOrdersUrl} target="_blank" rel="noopener noreferrer">
                  View Orders & License Keys
                </a>
              ) : (
                <span>My Orders link coming soon</span>
              )}
            </div>

            <div className="support-links">
              {FARMVERB_SOCIAL_LINKS.map((social) => (
                <a key={social.label} href={social.href} target="_blank" rel="noopener noreferrer">
                  {social.label}
                </a>
              ))}
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
