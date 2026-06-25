export const FUTURE_CHECKOUT_URL_ENV_KEYS = {
  nebulaCrush: 'NEXT_PUBLIC_LEMON_CHECKOUT_NEBULA_CRUSH',
  nebulaDrift: 'NEXT_PUBLIC_LEMON_CHECKOUT_NEBULA_DRIFT',
  nebulaSpace: 'NEXT_PUBLIC_LEMON_CHECKOUT_NEBULA_SPACE',
  nebulaSeries: 'NEXT_PUBLIC_LEMON_CHECKOUT_NEBULA_SERIES',
  nebulaRift: 'NEXT_PUBLIC_LEMON_CHECKOUT_NEBULA_RIFT',
  nebulaDrums: 'NEXT_PUBLIC_LEMON_CHECKOUT_NEBULA_DRUMS',
  glitchDrumPack: 'NEXT_PUBLIC_LEMON_CHECKOUT_GLITCH_DRUM_PACK'
} as const;

export type FutureCheckoutProductKey = keyof typeof FUTURE_CHECKOUT_URL_ENV_KEYS;

// TODO: Resolve product-specific Lemon Squeezy checkout URLs from the env keys above.
// The live URL lookup will stay off until the real checkout setup exists.
export function getFutureCheckoutUrl(_productKey: FutureCheckoutProductKey): string | null {
  return null;
}
