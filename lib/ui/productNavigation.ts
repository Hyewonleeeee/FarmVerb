import {
  type PluginSectionKey,
  type RouteKey,
  buildRouteHref
} from '@/lib/ui/farmVerbRoutes';

export type ProductNavigationItem = {
  id: string;
  label: string;
  href: string;
  route: RouteKey;
  pluginSection?: PluginSectionKey;
  kind: 'product' | 'explore';
};

export type ProductNavigationCategory = {
  id: string;
  label: string;
  items: readonly ProductNavigationItem[];
};

// Add future product families as new categories here. Empty or unreleased
// categories are intentionally omitted from the exported navigation data.
export const AUDIO_PLUGIN_NAVIGATION: readonly ProductNavigationCategory[] = [
  {
    id: 'nebula-series',
    label: 'Nebula Series',
    items: [
      {
        id: 'nebula-series-bundle',
        label: 'Nebula Series Bundle',
        href: buildRouteHref('plugins', 'series'),
        route: 'plugins',
        pluginSection: 'series',
        kind: 'product'
      },
      {
        id: 'nebula-crush',
        label: 'Nebula Crush',
        href: buildRouteHref('plugins', 'nebula-crush'),
        route: 'plugins',
        pluginSection: 'nebula-crush',
        kind: 'product'
      },
      {
        id: 'nebula-space',
        label: 'Nebula Space',
        href: buildRouteHref('plugins', 'nebula-space'),
        route: 'plugins',
        pluginSection: 'nebula-space',
        kind: 'product'
      },
      {
        id: 'nebula-drift',
        label: 'Nebula Drift',
        href: buildRouteHref('plugins', 'nebula-drift'),
        route: 'plugins',
        pluginSection: 'nebula-drift',
        kind: 'product'
      },
      {
        id: 'nebula-rift',
        label: 'Nebula Rift',
        href: buildRouteHref('plugins', 'nebula-rift'),
        route: 'plugins',
        pluginSection: 'nebula-rift',
        kind: 'product'
      },
      {
        id: 'nebula-drums',
        label: 'Nebula Drums',
        href: buildRouteHref('instrument'),
        route: 'instrument',
        kind: 'product'
      }
    ]
  },
  {
    id: 'organic-series',
    label: 'Organic Series',
    items: [
      {
        id: 'organic-series-bundle',
        label: 'Organic Series Bundle',
        href: buildRouteHref('plugins', 'organic-series'),
        route: 'plugins',
        pluginSection: 'organic-series',
        kind: 'product'
      },
      {
        id: 'jeju-citrus-air',
        label: 'Jeju Citrus Air',
        href: buildRouteHref('plugins', 'jeju-citrus-air'),
        route: 'plugins',
        pluginSection: 'jeju-citrus-air',
        kind: 'product'
      },
      {
        id: 'boseong-green-tea',
        label: 'Boseong Green Tea',
        href: buildRouteHref('plugins', 'boseong-green-tea'),
        route: 'plugins',
        pluginSection: 'boseong-green-tea',
        kind: 'product'
      },
      {
        id: 'uiseong-garlic',
        label: 'Uiseong Garlic',
        href: buildRouteHref('plugins', 'uiseong-garlic'),
        route: 'plugins',
        pluginSection: 'uiseong-garlic',
        kind: 'product'
      }
    ]
  },
  {
    id: 'explore',
    label: 'Explore',
    items: [
      {
        id: 'all-audio-plugins',
        label: 'All Audio Plugins',
        href: buildRouteHref('plugins'),
        route: 'plugins',
        kind: 'explore'
      }
    ]
  }
] as const;
