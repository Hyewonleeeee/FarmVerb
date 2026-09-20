export type RouteKey = 'home' | 'instrument' | 'plugins' | 'sample-pack' | 'support';

export type ThemeKey = 'home' | 'nebula' | 'organic' | 'glitch';

export type PluginSectionKey =
  | 'series'
  | 'nebula-crush'
  | 'nebula-space'
  | 'nebula-drift'
  | 'nebula-rift'
  | 'organic-series'
  | 'jeju-citrus-air'
  | 'boseong-green-tea'
  | 'uiseong-garlic';

export type ProductPublicRouteKey =
  | 'nebula-series'
  | 'nebula-crush'
  | 'nebula-space'
  | 'nebula-drift'
  | 'nebula-rift'
  | 'nebula-drums'
  | 'glitch-drum-pack-vol-1'
  | 'organic-series'
  | 'jeju-citrus-air'
  | 'boseong-green-tea'
  | 'uiseong-garlic';

type ProductRouteState = {
  route: RouteKey;
  pluginSection: PluginSectionKey;
};

export const PRODUCT_PUBLIC_PATHS: Record<ProductPublicRouteKey, `/${string}`> = {
  'nebula-series': '/nebula',
  'nebula-crush': '/crush',
  'nebula-space': '/space',
  'nebula-drift': '/drift',
  'nebula-rift': '/rift',
  'nebula-drums': '/drums',
  'glitch-drum-pack-vol-1': '/glitch',
  'organic-series': '/organic',
  'jeju-citrus-air': '/jeju',
  'boseong-green-tea': '/boseong',
  'uiseong-garlic': '/uiseong'
};

const PRODUCT_ROUTE_STATE_BY_PATH: Record<string, ProductRouteState> = {
  [PRODUCT_PUBLIC_PATHS['nebula-series']]: { route: 'plugins', pluginSection: 'series' },
  [PRODUCT_PUBLIC_PATHS['nebula-crush']]: { route: 'plugins', pluginSection: 'nebula-crush' },
  [PRODUCT_PUBLIC_PATHS['nebula-space']]: { route: 'plugins', pluginSection: 'nebula-space' },
  [PRODUCT_PUBLIC_PATHS['nebula-drift']]: { route: 'plugins', pluginSection: 'nebula-drift' },
  [PRODUCT_PUBLIC_PATHS['nebula-rift']]: { route: 'plugins', pluginSection: 'nebula-rift' },
  [PRODUCT_PUBLIC_PATHS['nebula-drums']]: { route: 'instrument', pluginSection: 'series' },
  [PRODUCT_PUBLIC_PATHS['glitch-drum-pack-vol-1']]: { route: 'sample-pack', pluginSection: 'series' },
  [PRODUCT_PUBLIC_PATHS['organic-series']]: { route: 'plugins', pluginSection: 'organic-series' },
  [PRODUCT_PUBLIC_PATHS['jeju-citrus-air']]: { route: 'plugins', pluginSection: 'jeju-citrus-air' },
  [PRODUCT_PUBLIC_PATHS['boseong-green-tea']]: { route: 'plugins', pluginSection: 'boseong-green-tea' },
  [PRODUCT_PUBLIC_PATHS['uiseong-garlic']]: { route: 'plugins', pluginSection: 'uiseong-garlic' }
};

const PUBLIC_PATH_BY_PLUGIN_SECTION = {
  series: PRODUCT_PUBLIC_PATHS['nebula-series'],
  'nebula-crush': PRODUCT_PUBLIC_PATHS['nebula-crush'],
  'nebula-space': PRODUCT_PUBLIC_PATHS['nebula-space'],
  'nebula-drift': PRODUCT_PUBLIC_PATHS['nebula-drift'],
  'nebula-rift': PRODUCT_PUBLIC_PATHS['nebula-rift'],
  'organic-series': PRODUCT_PUBLIC_PATHS['organic-series'],
  'jeju-citrus-air': PRODUCT_PUBLIC_PATHS['jeju-citrus-air'],
  'boseong-green-tea': PRODUCT_PUBLIC_PATHS['boseong-green-tea'],
  'uiseong-garlic': PRODUCT_PUBLIC_PATHS['uiseong-garlic']
} satisfies Record<PluginSectionKey, string>;

export const PRODUCT_PUBLIC_ROUTE_SEGMENTS = Object.values(PRODUCT_PUBLIC_PATHS).map((path) => path.slice(1));

export const ROUTES: Record<RouteKey, { path: string; title: string }> = {
  home: {
    path: '/',
    title: 'FarmVerb | Grow Your Sound'
  },
  instrument: {
    path: PRODUCT_PUBLIC_PATHS['nebula-drums'],
    title: 'FarmVerb | Software Instrument'
  },
  plugins: {
    path: '/plugins',
    title: 'FarmVerb | Audio Plugins'
  },
  'sample-pack': {
    path: PRODUCT_PUBLIC_PATHS['glitch-drum-pack-vol-1'],
    title: 'FarmVerb | Sample Pack'
  },
  support: {
    path: '/support',
    title: 'FarmVerb | Support'
  }
};

export const THEME_BY_ROUTE: Record<RouteKey, ThemeKey> = {
  home: 'home',
  instrument: 'nebula',
  plugins: 'nebula',
  'sample-pack': 'glitch',
  support: 'home'
};

export const PLUGIN_SECTION_KEYS: PluginSectionKey[] = [
  'series',
  'nebula-crush',
  'nebula-space',
  'nebula-drift',
  'nebula-rift',
  'organic-series',
  'jeju-citrus-air',
  'boseong-green-tea',
  'uiseong-garlic'
];

export const ORGANIC_PLUGIN_SECTION_KEYS: PluginSectionKey[] = [
  'organic-series',
  'jeju-citrus-air',
  'boseong-green-tea',
  'uiseong-garlic'
];

export const DEFAULT_PLUGIN_SECTION: PluginSectionKey = 'series';

export function normalizeRouteKey(inputRoute: string | null | undefined): RouteKey {
  if (inputRoute && inputRoute in ROUTES) {
    return inputRoute as RouteKey;
  }

  return 'home';
}

export function normalizePluginSectionKey(inputSection: string | null | undefined): PluginSectionKey {
  const normalized = inputSection?.trim().toLowerCase() ?? '';
  if (PLUGIN_SECTION_KEYS.includes(normalized as PluginSectionKey)) {
    return normalized as PluginSectionKey;
  }

  return DEFAULT_PLUGIN_SECTION;
}

export function isOrganicPluginSection(section: PluginSectionKey) {
  return ORGANIC_PLUGIN_SECTION_KEYS.includes(section);
}

export function buildRouteHref(route: RouteKey, pluginSection?: PluginSectionKey) {
  if (route !== 'plugins') {
    return ROUTES[route].path;
  }

  if (!pluginSection) {
    return ROUTES.plugins.path;
  }

  return PUBLIC_PATH_BY_PLUGIN_SECTION[pluginSection];
}

export function getRouteStateFromLocation(pathname: string, search: string) {
  const normalizedPath = `/${pathname.replace(/^\/+/, '').replace(/\/+$/, '').trim()}`;
  const productRouteState = PRODUCT_ROUTE_STATE_BY_PATH[normalizedPath.toLowerCase()];
  if (productRouteState) {
    return productRouteState;
  }

  const route = normalizeRouteKey(normalizedPath.replace(/^\/+/, '') || 'home');
  const pluginSection = route === 'plugins' ? normalizePluginSectionKey(new URLSearchParams(search).get('section')) : DEFAULT_PLUGIN_SECTION;

  return { route, pluginSection };
}
