import { getMainProductPrice, getProductPricing } from '@/lib/pricing/products';

export type CartItem = {
  slug: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  quantity: number;
  image: string | null;
};

type CatalogProduct = {
  slug: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  image: string | null;
};

const CART_STORAGE_KEY = 'farmverb_cart_v1';
const CART_UPDATED_EVENT = 'farmverb:cart-updated';

function priceOf(productName: string, fallback = 0) {
  const pricing = getProductPricing(productName);
  return pricing ? getMainProductPrice(pricing) : fallback;
}

const PRODUCT_CATALOG: CatalogProduct[] = [
  {
    slug: 'nebula-series',
    name: 'Nebula Series',
    description: 'Nebula plugin overview',
    price: priceOf('Nebula Series', 189),
    currency: 'USD',
    image: '/Nebula%20Series/Main/Nebula%20Series.png'
  },
  {
    slug: 'germinate',
    name: 'Germinate',
    description: 'Organic delay processor',
    price: priceOf('Germinate', 49),
    currency: 'USD',
    image: '/Germinate/Germinate.png'
  },
  {
    slug: 'nebula-crush',
    name: 'Nebula Crush',
    description: 'Dynamic crush processor',
    price: priceOf('Nebula Crush', 39),
    currency: 'USD',
    image: '/Nebula%20Series/Main/1-Nebula%20Crush.png'
  },
  {
    slug: 'nebula-space',
    name: 'Nebula Space',
    description: 'Atmospheric space processor',
    price: priceOf('Nebula Space', 59),
    currency: 'USD',
    image: '/Nebula%20Series/Main/2-Nebula%20Space.png'
  },
  {
    slug: 'nebula-drift',
    name: 'Nebula Drift',
    description: 'Spectral motion processor',
    price: priceOf('Nebula Drift', 49),
    currency: 'USD',
    image: '/Nebula%20Series/Main/3-Nebula%20Drift.png'
  },
  {
    slug: 'nebula-rift',
    name: 'Nebula Rift',
    description: 'Fractured digital processor',
    price: priceOf('Nebula Rift', 59),
    currency: 'USD',
    image: '/Nebula%20Series/Main/4-Nebula%20Rift.png'
  },
  {
    slug: 'nebula-drums',
    name: 'Nebula Drums',
    description: 'Decent Sampler instrument',
    price: priceOf('Nebula Drums', 49),
    currency: 'USD',
    image: '/Nebula%20Series/Main/5-Nebula%20Drums.png'
  },
  {
    slug: 'glitch-drum-pack-vol-1',
    name: 'Glitch Drum Pack Vol.1',
    description: 'Digital glitch drum sample pack',
    price: priceOf('Glitch Drum Pack Vol.1', 49),
    currency: 'USD',
    image: '/GlitchDrum/GlitchDrum.png'
  }
];

const productByName = new Map(PRODUCT_CATALOG.map((product) => [product.name.toLowerCase(), product]));
const productBySlug = new Map(PRODUCT_CATALOG.map((product) => [product.slug, product]));

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

function resolveProduct(productName: string): CatalogProduct {
  const fromCatalog = productByName.get(productName.toLowerCase().trim());
  if (fromCatalog) {
    return fromCatalog;
  }

  return {
    slug: slugify(productName) || `custom-${Date.now()}`,
    name: productName,
    description: 'Digital audio product',
    price: 0,
    currency: 'USD',
    image: null
  };
}

function resolveCatalogProduct(input: Partial<CartItem>) {
  const slug = typeof input.slug === 'string' ? input.slug.trim() : '';
  if (slug) {
    const bySlug = productBySlug.get(slug);
    if (bySlug) {
      return bySlug;
    }
  }

  const name = typeof input.name === 'string' ? input.name.trim().toLowerCase() : '';
  if (name) {
    return productByName.get(name) ?? null;
  }

  return null;
}

function normalizeCartItem(input: Partial<CartItem>): CartItem | null {
  const slug = typeof input.slug === 'string' ? input.slug.trim() : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';

  if (!slug || !name) {
    return null;
  }

  const catalogProduct = resolveCatalogProduct(input);
  const price = typeof input.price === 'number' && Number.isFinite(input.price) ? input.price : 0;
  const currency = typeof input.currency === 'string' && input.currency.trim() ? input.currency.trim().toUpperCase() : 'USD';
  const image = catalogProduct?.image ?? (typeof input.image === 'string' && input.image.trim() ? input.image.trim() : null);
  const description =
    catalogProduct?.description ??
    (typeof input.description === 'string' && input.description.trim() ? input.description.trim() : 'Digital audio product');

  return {
    slug,
    name,
    description,
    quantity: 1,
    price: price >= 0 ? price : 0,
    currency,
    image
  };
}

function emitCartUpdated() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

function writeCartItems(nextItems: CartItem[]) {
  const storage = getStorage();
  if (!storage) {
    return nextItems;
  }

  storage.setItem(CART_STORAGE_KEY, JSON.stringify(nextItems));
  emitCartUpdated();
  return nextItems;
}

export function getCartItems(): CartItem[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  const raw = storage.getItem(CART_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CartItem>[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeCartItem(item))
      .filter((item): item is CartItem => Boolean(item));
  } catch {
    return [];
  }
}

export function addItemToCart(productName: string): CartItem[] {
  const product = resolveProduct(productName);
  const currentItems = getCartItems();
  const existing = currentItems.find((item) => item.slug === product.slug);

  if (!existing) {
    return writeCartItems([
      ...currentItems,
      {
        slug: product.slug,
        name: product.name,
        description: product.description,
        price: product.price,
        currency: product.currency,
        quantity: 1,
        image: product.image
      }
    ]);
  }

  return writeCartItems(currentItems);
}

export function updateCartItemQuantity(productSlug: string, nextQuantity: number): CartItem[] {
  const safeQuantity = Number.isFinite(nextQuantity) ? Math.floor(nextQuantity) : 1;
  if (safeQuantity <= 0) {
    return removeCartItem(productSlug);
  }

  const currentItems = getCartItems();
  const nextItems = currentItems.map((item) =>
    item.slug === productSlug ? { ...item, quantity: safeQuantity } : item
  );
  return writeCartItems(nextItems);
}

export function removeCartItem(productSlug: string): CartItem[] {
  const currentItems = getCartItems();
  const nextItems = currentItems.filter((item) => item.slug !== productSlug);
  return writeCartItems(nextItems);
}

export function clearCartItems(): CartItem[] {
  return writeCartItems([]);
}

export function getCartItemCount(items: CartItem[]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function getCartSubtotal(items: CartItem[]) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function getCatalogProductBySlug(slug: string) {
  return productBySlug.get(slug) ?? null;
}

export function subscribeToCart(listener: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const onCartUpdated = () => listener();
  const onStorage = (event: StorageEvent) => {
    if (event.key === CART_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener(CART_UPDATED_EVENT, onCartUpdated);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(CART_UPDATED_EVENT, onCartUpdated);
    window.removeEventListener('storage', onStorage);
  };
}
