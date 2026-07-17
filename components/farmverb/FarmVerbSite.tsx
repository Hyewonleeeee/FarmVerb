'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import AuthNav from '@/components/auth/AuthNav';
import GlobalFooter from '@/components/farmverb/GlobalFooter';
import {
  addItemToCart,
  getCatalogProductByName,
  getCartItemCount,
  getCartItems,
  subscribeToCart,
  type CartItem
} from '@/lib/cart/store';
import { getLemonBuyButtonLabel, getLemonCheckoutUrlByProductName, getLemonMyOrdersUrl } from '@/lib/checkout/lemonLinks';
import { formatUsdPrice, getLimitedSalePrice, getMainProductPrice, getProductPricing } from '@/lib/pricing/products';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import {
  DEFAULT_PLUGIN_SECTION,
  type PluginSectionKey,
  type RouteKey,
  buildRouteHref,
  getRouteStateFromLocation,
} from '@/lib/ui/farmVerbRoutes';
import { initFarmVerbSite } from '@/lib/ui/initFarmVerbSite';

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

const AUDIO_PLUGIN_MENU_ITEMS: Array<{ label: string; section: PluginSectionKey }> = [
  { label: 'Nebula Series', section: 'series' },
  { label: 'Nebula Crush', section: 'nebula-crush' },
  { label: 'Nebula Space', section: 'nebula-space' },
  { label: 'Nebula Drift', section: 'nebula-drift' },
  { label: 'Nebula Rift', section: 'nebula-rift' }
];

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

const NEBULA_BUNDLE_PRODUCT: PluginProduct = {
  section: 'series',
  name: 'Nebula Series',
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

const NEBULA_MANUALS = {
  crush: '/Manual/Nebula_Crush_User_Manual.pdf',
  space: '/Manual/Nebula_Space_User_Manual.pdf',
  drift: '/Manual/Nebula_Drift_User_Manual.pdf',
  rift: '/Manual/Nebula_Rift_User_Manual.pdf',
  drums: '/Manual/Nebula_Drums_User_Manual.pdf'
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
    items: ['VST3', 'AU on macOS', 'AAX optional build']
  },
  {
    label: 'Troubleshooting',
    items: ['Clear plugin cache', 'Run a full rescan']
  }
];

const RIFT_REQUIREMENTS: SupportRequirementGroup[] = [
  {
    label: 'macOS VST3',
    items: ['Install Nebula Rift.vst3 to ~/Library/Audio/Plug-Ins/VST3/']
  },
  {
    label: 'macOS AU',
    items: ['Install Nebula Rift.component to ~/Library/Audio/Plug-Ins/Components/ if included']
  },
  {
    label: 'Host Scan',
    items: ['Rescan plugins in your DAW', 'Clear host plugin cache if not visible']
  },
  {
    label: 'Testing Note',
    items: ['Use the current user-path build if user and system plugin locations both contain Nebula Rift']
  }
];

const DRUMS_REQUIREMENTS: SupportRequirementGroup[] = [
  {
    label: 'Host',
    items: ['Decent Sampler required']
  },
  {
    label: 'Installation',
    items: ['Install Decent Sampler', 'Load Nebula Drums inside Decent Sampler', 'Open presets from the Nebula Drums library']
  },
  {
    label: 'Instrument Format',
    items: ['Creative drum instrument for Decent Sampler']
  },
  {
    label: 'Keyboard Layout',
    items: ['C1 Glitch & Industrial', 'C2 Organic Lo-Fi', 'C3 Cybernetic Trap', 'C4 Experimental Cinematic']
  }
];

const PRODUCT_COMMERCIAL_DETAILS: Record<string, ProductCommercialDetails> = {
  'Nebula Series': {
    productName: 'Nebula Series',
    eyebrow: 'Nebula Series Bundle',
    headline: 'The Complete Nebula Collection',
    subhead: 'Four effects for saturation, space, motion, and fracture. Nebula Drums included as a bonus.',
    body: 'Nebula Series brings the core Nebula processors together as one expandable collection: Crush for harmonic pressure, Space for cinematic ambience, Drift for fluid modulation, and Rift for granular fracture.',
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
    valueItems: ['Drive', 'Tone', 'Blend', 'Output'],
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
        title: 'Blend control',
        body: 'Mix dry and processed sound to keep the original signal present.'
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
        title: 'Set Drive',
        body: 'Increase distortion intensity until the texture lands.'
      },
      {
        title: 'Balance Tone and Blend',
        body: 'Shape brightness and mix the processed signal to taste.'
      },
      {
        title: 'Match Output',
        body: 'Finish by setting the final output level in context.'
      }
    ],
    relatedProducts: ['Nebula Space', 'Nebula Rift', 'Nebula Series']
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
    relatedProducts: ['Nebula Drift', 'Nebula Crush', 'Nebula Series']
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
    relatedProducts: ['Nebula Space', 'Nebula Rift', 'Nebula Series']
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
    relatedProducts: ['Nebula Crush', 'Nebula Drift', 'Nebula Series']
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
        title: 'Install Decent Sampler',
        body: 'Nebula Drums requires Decent Sampler before loading the instrument.'
      },
      {
        title: 'Load a preset',
        body: 'Open the Nebula Drums library inside Decent Sampler.'
      },
      {
        title: 'Play a theme',
        body: 'Use the mapped keyboard zones to move between drum worlds.'
      },
      {
        title: 'Shape with XY',
        body: 'Use the XY Pad and front-panel controls for movement and space.'
      }
    ],
    relatedProducts: ['Nebula Series', 'Nebula Crush', 'Glitch Drum Pack Vol.1']
  }
};

const PRODUCT_SUPPORT_DETAILS: Record<string, ProductSupportDetails> = {
  'Nebula Series': {
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
        items: ['VST3', 'AU on macOS', 'AAX optional build where available']
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
        answer: 'Yes. The Nebula Drums manual states that Decent Sampler is required and should be installed before using Nebula Drums.'
      },
      {
        question: 'Which plugin formats are referenced in the manuals?',
        answer: 'The Nebula plugin manuals reference VST3, AU on macOS, and AAX as an optional build. Installation steps also describe rescanning the host after installation.'
      },
      {
        question: 'Where are the individual manuals?',
        answer: 'Use the manual download control near the purchase buttons to access the included product manuals.'
      },
      {
        question: 'Can I use the products commercially?',
        answer: 'The manuals state that use is allowed in personal and commercial music productions, while redistribution, resale, sharing of installers, license keys, sample content, or product files is not permitted.'
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
        question: 'What is Nebula Crush?',
        answer: 'The manual describes Nebula Crush as an energetic distortion plugin with a cinematic edge for subtle harmonic color or aggressive modern grit.'
      },
      {
        question: 'How do I install it?',
        answer: 'Run the installer, choose AU/VST3 locations on macOS or confirm the VST3 path on Windows, then rescan your DAW or host.'
      },
      {
        question: 'Which formats are listed?',
        answer: 'The manual lists VST3, AU on macOS, and AAX as an optional build.'
      },
      {
        question: 'Which controls define the workflow?',
        answer: 'The interface overview lists Preset Browser, SAFE/PUNCHY, Character Matrix, Drive, Blend, Tone, and Output.'
      },
      {
        question: 'What is the simple workflow?',
        answer: 'The manual suggests choosing a character, setting Drive, balancing with Tone and Blend, then level matching with Output.'
      },
      {
        question: 'Can I use it commercially?',
        answer: 'The legal page in the manual allows personal and commercial music productions, but redistribution, resale, sharing of installers, license keys, sample content, or product files is not permitted.'
      }
    ],
    relatedProducts: ['Nebula Series', 'Nebula Space', 'Nebula Rift']
  },
  'Nebula Space': {
    title: 'Nebula Space Support',
    description: 'Atmospheric reverb for depth, motion, and cinematic space shaping.',
    requirements: STANDARD_NEBULA_PLUGIN_REQUIREMENTS,
    manuals: [{ label: 'Nebula Space User Manual', href: NEBULA_MANUALS.space }],
    faqs: [
      {
        question: 'What is Nebula Space?',
        answer: 'The manual describes Nebula Space as an atmospheric reverb plugin designed for width, depth, and smooth cinematic tails while staying clear in a mix.'
      },
      {
        question: 'How do I install it?',
        answer: 'Run the installer, choose AU/VST3 locations on macOS or confirm the VST3 path on Windows, then rescan your DAW or host.'
      },
      {
        question: 'Which formats are listed?',
        answer: 'The manual lists VST3, AU on macOS, and AAX as an optional build.'
      },
      {
        question: 'Which controls are mapped on the interface?',
        answer: 'The interface overview lists Preset Browser, Space Field, Size, Early, Decay, Color, Mix, Warp, Mass, and Freeze.'
      },
      {
        question: 'What does Freeze do?',
        answer: 'The parameter page states that Freeze holds the current ambience bed for infinite pads and transition-ready texture beds.'
      },
      {
        question: 'What is the simple workflow?',
        answer: 'The manual suggests setting Size, placing Early, tuning Decay and Color, blending with Mix, then finishing with Warp and Mass.'
      }
    ],
    relatedProducts: ['Nebula Series', 'Nebula Drift', 'Nebula Crush']
  },
  'Nebula Drift': {
    title: 'Nebula Drift Support',
    description: 'Fluid modulation for movement, phase-like drift, and cinematic spatial motion.',
    requirements: STANDARD_NEBULA_PLUGIN_REQUIREMENTS,
    manuals: [{ label: 'Nebula Drift User Manual', href: NEBULA_MANUALS.drift }],
    faqs: [
      {
        question: 'What is Nebula Drift?',
        answer: 'The manual describes Nebula Drift as a flowing modulation plugin with atmospheric, phase-like movement that can stay subtle or become expressive for cinematic motion.'
      },
      {
        question: 'How do I install it?',
        answer: 'Run the installer, choose AU/VST3 locations on macOS or confirm the VST3 path on Windows, then rescan your DAW or host.'
      },
      {
        question: 'Which formats are listed?',
        answer: 'The manual lists VST3, AU on macOS, and AAX as an optional build.'
      },
      {
        question: 'Which modes are included?',
        answer: 'The interface overview lists a Mode Selector with SILK, TIDE, and FRAC.'
      },
      {
        question: 'Which controls define the sound?',
        answer: 'The parameter page lists Motion, Drift, Width, Blur, Mix, and Mode.'
      },
      {
        question: 'What is the simple workflow?',
        answer: 'The manual suggests setting Mix, shaping Width and Drift, adding Motion and Blur, then finalizing Mode.'
      }
    ],
    relatedProducts: ['Nebula Series', 'Nebula Space', 'Nebula Rift']
  },
  'Nebula Rift': {
    title: 'Nebula Rift Support',
    description: 'Experimental granular fracture for destructive texture, elastic tone motion, and cinematic rift worlds.',
    requirements: RIFT_REQUIREMENTS,
    manuals: [{ label: 'Nebula Rift User Manual', href: NEBULA_MANUALS.rift }],
    faqs: [
      {
        question: 'What is Nebula Rift?',
        answer: 'The manual describes Nebula Rift as a creative granular fracture effect that captures small fragments and rebuilds them as animated rift fields.'
      },
      {
        question: 'How do I install the current build?',
        answer: 'The manual lists macOS VST3 installation to ~/Library/Audio/Plug-Ins/VST3/ and AU component installation to ~/Library/Audio/Plug-Ins/Components/ if the AU format is included.'
      },
      {
        question: 'What should I do if it does not appear in my DAW?',
        answer: 'The manual recommends rescanning plugins in the DAW, clearing the host plugin cache, and running a full rescan.'
      },
      {
        question: 'Which modes are included?',
        answer: 'The manual lists Soft Rift, Glass Crack, and Deep Tear.'
      },
      {
        question: 'Which controls define the sound?',
        answer: 'The parameter page lists Mode, Rift Size, Density, Color, Mix, Motion, and Fold.'
      },
      {
        question: 'How do presets behave?',
        answer: 'The manual says Nebula Rift includes 15 curated presets grouped by mode. Preset selection recalls several controls, while Mix intentionally stays where you set it.'
      }
    ],
    relatedProducts: ['Nebula Series', 'Nebula Crush', 'Nebula Drift']
  },
  'Nebula Drums': {
    title: 'Nebula Drums Support',
    description: 'A creative drum instrument built for Decent Sampler.',
    requirements: DRUMS_REQUIREMENTS,
    manuals: [{ label: 'Nebula Drums User Manual', href: NEBULA_MANUALS.drums }],
    faqs: [
      {
        question: 'What is Nebula Drums?',
        answer: 'The manual describes Nebula Drums as a creative drum instrument built for Decent Sampler with four themed drum worlds.'
      },
      {
        question: 'What do I need before using it?',
        answer: 'The manual states that Nebula Drums requires Decent Sampler and that Decent Sampler should be installed before using Nebula Drums.'
      },
      {
        question: 'How do I install and open it?',
        answer: 'Install Decent Sampler, load Nebula Drums inside Decent Sampler, then open presets from the Nebula Drums library.'
      },
      {
        question: 'How is the keyboard laid out?',
        answer: 'The manual maps C1 to Glitch & Industrial, C2 to Organic Lo-Fi, C3 to Cybernetic Trap, and C4 to Experimental Cinematic.'
      },
      {
        question: 'What does the XY Pad control?',
        answer: 'The manual says the XY Pad controls multiple effects simultaneously. The X axis covers wavefolder drive, wavefolder threshold, phaser mix, and phaser modulation rate; the Y axis covers delay wet level, delay feedback, and reverb amount.'
      },
      {
        question: 'Can I use it commercially?',
        answer: 'The legal page in the manual allows personal and commercial music productions, but redistribution, resale, extraction, sharing, or repackaging of the included sample content or instrument files is not permitted.'
      }
    ],
    relatedProducts: ['Nebula Series', 'Nebula Crush', 'Glitch Drum Pack Vol.1']
  }
};

const GLITCH_FAQ_ITEMS: FaqItem[] = [
  {
    question: 'What audio format is included?',
    answer: 'The page specifications list WAV 24-bit / 48 kHz files.'
  },
  {
    question: 'How many samples are included?',
    answer: 'The page specifications list 100 samples.'
  },
  {
    question: 'Which DAWs are supported?',
    answer: 'The page specifications list Ableton Live, Logic Pro, FL Studio, Pro Tools, Studio One, and most modern DAWs.'
  },
  {
    question: 'Can I use the samples commercially?',
    answer: 'The license section allows use in music releases, games, films, broadcasts, and live performances.'
  },
  {
    question: 'Can I redistribute the raw sample files?',
    answer: 'No. The license section prohibits redistribution or resale of the raw sample files.'
  }
];

const BUNDLE_INCLUDED_PRODUCT_NAMES = [
  'Nebula Crush',
  'Nebula Space',
  'Nebula Drift',
  'Nebula Rift',
  'Nebula Drums'
] as const;

function getHomeProductCard(productName: string) {
  return HOME_FEATURE_CARDS.find((card) => card.productName === productName || card.name === productName) ?? null;
}

function getRelatedProductCards(productNames: string[]) {
  return productNames
    .map((productName) => getHomeProductCard(productName))
    .filter((card): card is HomeFeatureCard => Boolean(card));
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

function ProductCommercialSections({
  details,
  manuals,
  relatedCards,
  onAddToCart,
  onBuyNow,
  hasCheckoutUrl,
  getBuyLabel
}: {
  details: ProductCommercialDetails;
  manuals: ManualDownloadItem[];
  relatedCards: HomeFeatureCard[];
  onAddToCart: (productName: string) => void;
  onBuyNow: (productName: string) => void;
  hasCheckoutUrl: (productName: string) => boolean;
  getBuyLabel: (productName: string) => string;
}) {
  const checkoutReady = hasCheckoutUrl(details.productName);
  const primaryManual = manuals[0] ?? null;

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
            {!checkoutReady ? <span className="checkout-coming-soon">Checkout link coming soon</span> : null}
          </div>
        </div>
        <figure className={`product-story-media product-story-media-${details.imageLayout} interactive-tilt`}>
          <img src={details.image} alt={details.imageAlt} />
        </figure>
      </section>

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

      <section className="product-demo-teaser">
        <div>
          <p className="section-overline">Demo Video</p>
          <h3>Demo film placeholder</h3>
          <p>Future YouTube demo embeds will appear here.</p>
        </div>
        <span aria-hidden="true">▶</span>
      </section>

      {relatedCards.length > 0 ? (
        <section className="product-related-section">
          <div className="product-section-kicker">
            <p className="section-overline">Related Products</p>
            <h3>More from FarmVerb</h3>
          </div>
          <div className="related-product-grid">
            {relatedCards.map((card) => {
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
                  <div className="related-product-actions">
                    <Link
                      href={card.href}
                      className="plugin-action plugin-action-cart"
                      data-route={card.route}
                      data-plugin-section={card.pluginSection}
                    >
                      View
                    </Link>
                    <button
                      type="button"
                      className="plugin-action plugin-action-buy"
                      onClick={() => onBuyNow(card.productName)}
                      disabled={!checkoutReady}
                      title={checkoutReady ? undefined : 'Checkout link coming soon'}
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
                  </div>
                </article>
              );
            })}
          </div>
        </section>
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

function BundleIncludesSection() {
  const includedCards = getRelatedProductCards([...BUNDLE_INCLUDED_PRODUCT_NAMES]);

  return (
    <section className="bundle-includes-section" aria-label="Nebula Series bundle contents">
      <div className="product-support-head">
        <p className="section-overline">Bundle Includes</p>
        <h2>Four Nebula effects plus Nebula Drums as a bonus.</h2>
        <p>Nebula Series is prepared as a complete bundle with the core effect devices and the Decent Sampler drum instrument included as a bonus.</p>
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

export default function FarmVerbSite() {
  const [currentRoute, setCurrentRoute] = useState<RouteKey>('home');
  const [activeNebulaSection, setActiveNebulaSection] = useState<PluginSectionKey>(DEFAULT_PLUGIN_SECTION);
  const [pluginMenuOpen, setPluginMenuOpen] = useState(false);
  const audioPluginsMenuRef = useRef<HTMLDivElement | null>(null);
  const cartPreviewRef = useRef<HTMLDivElement | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartUserId, setCartUserId] = useState<string | null>(null);
  const [cartAuthReady, setCartAuthReady] = useState(false);
  const [buyNowNotice, setBuyNowNotice] = useState<string | null>(null);
  const [cartPreviewOpen, setCartPreviewOpen] = useState(false);
  const [cartFeedback, setCartFeedback] = useState<{ message: string; item: CartItem | null } | null>(null);
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
      return NEBULA_BUNDLE_PRODUCT;
    }

    return NEBULA_PRODUCTS.find((product) => product.section === activeNebulaSection) ?? null;
  }, [activeNebulaSection]);

  const visibleProducts = useMemo(() => {
    if (activeNebulaSection === DEFAULT_PLUGIN_SECTION) {
      return [NEBULA_BUNDLE_PRODUCT];
    }

    return selectedSeriesProduct ? [selectedSeriesProduct] : NEBULA_PRODUCTS;
  }, [activeNebulaSection, selectedSeriesProduct]);

  const glitchPackPricing = getProductPricing('Glitch Drum Pack Vol.1');
  const glitchPackPrice = glitchPackPricing ? getMainProductPrice(glitchPackPricing) : 49;
  const glitchPackRegularPrice = glitchPackPricing?.regularPrice ?? 99;

  const showSeriesFeature = Boolean(selectedSeriesProduct) && currentRoute === 'plugins';

  const activePluginMenuSection = currentRoute === 'plugins' ? activeNebulaSection : null;
  const activePluginMenuName =
    activeNebulaSection === DEFAULT_PLUGIN_SECTION ? 'Nebula Series' : selectedSeriesProduct?.name ?? 'Nebula Series';
  const activePluginMenuCopy =
    activeNebulaSection === DEFAULT_PLUGIN_SECTION
      ? 'The complete Nebula bundle, prepared as a single product.'
      : `Choose the overview or jump straight into ${selectedSeriesProduct?.name ?? 'this device'}.`;

  const selectNebulaSection = (section: PluginSectionKey) => {
    setCurrentRoute('plugins');
    setActiveNebulaSection(section);
    setPluginMenuOpen(false);
  };

  const onProductNameClick = (section: PluginSectionKey) => {
    selectNebulaSection(section);
  };

  const hasCheckoutUrl = (productName: string) => Boolean(getLemonCheckoutUrlByProductName(productName));

  const renderSeriesFeature = () => {
    if (!showSeriesFeature || !selectedSeriesProduct) {
      return null;
    }

    const checkoutReady = hasCheckoutUrl(selectedSeriesProduct.name);

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
            <span>Preview unavailable</span>
          </div>
        )}

        <div className="plugin-feature-copy">
          <h3>{selectedSeriesProduct.name}</h3>
          <p>{selectedSeriesProduct.description}</p>
          <ProductPrice productName={selectedSeriesProduct.name} />
          <div className="plugin-feature-actions">
            <button
              type="button"
              className="plugin-action plugin-action-cart"
              onClick={() => void addToCart(selectedSeriesProduct.name)}
            >
              Add to Cart
            </button>
            <button
              type="button"
              className="plugin-action plugin-action-buy"
              onClick={() => onBuyNow(selectedSeriesProduct.name)}
              disabled={!checkoutReady}
              title={checkoutReady ? undefined : 'Checkout link coming soon'}
            >
              {getPlaceholderBuyLabel(selectedSeriesProduct.name)}
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
        relatedCards={getRelatedProductCards(details.relatedProducts)}
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
                        onClick={() => void addToCart(card.productName)}
                      >
                        Add to Cart
                      </button>
                    </div>
                  </article>
                ))}
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
              {activeNebulaSection === DEFAULT_PLUGIN_SECTION ? <BundleIncludesSection /> : null}
              {renderProductSupport(activePluginMenuName)}
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
