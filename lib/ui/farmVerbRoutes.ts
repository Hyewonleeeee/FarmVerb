export type RouteKey = 'home' | 'instrument' | 'plugins' | 'sample-pack' | 'support';

export type ThemeKey = 'home' | 'nebula' | 'glitch';

export type PluginSectionKey = 'series' | 'nebula-crush' | 'nebula-space' | 'nebula-drift' | 'nebula-rift';

export const ROUTES: Record<RouteKey, { path: string; title: string }> = {
  home: {
    path: '/',
    title: 'FarmVerb | Grow Your Sound'
  },
  instrument: {
    path: '/instrument',
    title: 'FarmVerb | Software Instrument'
  },
  plugins: {
    path: '/plugins',
    title: 'FarmVerb | Audio Plugins'
  },
  'sample-pack': {
    path: '/sample-pack',
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
  'nebula-rift'
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

export function buildRouteHref(route: RouteKey, pluginSection?: PluginSectionKey) {
  if (route !== 'plugins') {
    return ROUTES[route].path;
  }

  if (!pluginSection || pluginSection === DEFAULT_PLUGIN_SECTION) {
    return ROUTES.plugins.path;
  }

  return `${ROUTES.plugins.path}?section=${encodeURIComponent(pluginSection)}`;
}

export function getRouteStateFromLocation(pathname: string, search: string) {
  const route = normalizeRouteKey(pathname.replace(/^\/+/, '').replace(/\/+$/, '').trim() || 'home');
  const pluginSection = route === 'plugins' ? normalizePluginSectionKey(new URLSearchParams(search).get('section')) : DEFAULT_PLUGIN_SECTION;

  return { route, pluginSection };
}
