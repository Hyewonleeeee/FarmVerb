export type CartItem = {
  slug: string;
  name: string;
  price: number;
  currency: string;
  quantity: number;
  image: string | null;
};

type CatalogProduct = {
  slug: string;
  name: string;
  price: number;
  currency: string;
  image: string | null;
};

const CART_STORAGE_KEY = 'farmverb_cart_v1';
const CART_UPDATED_EVENT = 'farmverb:cart-updated';

const PRODUCT_CATALOG: CatalogProduct[] = [
  {
    slug: 'germinate',
    name: 'Germinate',
    price: 89,
    currency: 'USD',
    image: '/Germinate/Germinate.png'
  },
  {
    slug: 'nebula-crush',
    name: 'Nebula Crush',
    price: 79,
    currency: 'USD',
    image: '/Nebula%20Series/Crush/Nebula%20Crush.png'
  },
  {
    slug: 'nebula-space',
    name: 'Nebula Space',
    price: 79,
    currency: 'USD',
    image: '/Nebula%20Series/Space/Nebula%20Space.png'
  },
  {
    slug: 'nebula-warp',
    name: 'Nebula Warp',
    price: 79,
    currency: 'USD',
    image: null
  },
  {
    slug: 'nebula-rift',
    name: 'Nebula Rift',
    price: 79,
    currency: 'USD',
    image: null
  },
  {
    slug: 'nebula-drums',
    name: 'Nebula Drums',
    price: 69,
    currency: 'USD',
    image: '/Nebula%20Series/Drums/Nebula%20Kinetic%20Drums_1.png'
  },
  {
    slug: 'glitch-drum-pack-vol-1',
    name: 'Glitch Drum Pack Vol.1',
    price: 29,
    currency: 'USD',
    image: '/GlitchDrum/GlitchDrum.png'
  }
];

const productByName = new Map(PRODUCT_CATALOG.map((product) => [product.name.toLowerCase(), product]));

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
    price: 0,
    currency: 'USD',
    image: null
  };
}

function normalizeCartItem(input: Partial<CartItem>): CartItem | null {
  const slug = typeof input.slug === 'string' ? input.slug.trim() : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';

  if (!slug || !name) {
    return null;
  }

  const quantity = typeof input.quantity === 'number' && Number.isFinite(input.quantity) ? Math.floor(input.quantity) : 1;
  const safeQuantity = quantity > 0 ? quantity : 1;
  const price = typeof input.price === 'number' && Number.isFinite(input.price) ? input.price : 0;
  const currency = typeof input.currency === 'string' && input.currency.trim() ? input.currency.trim().toUpperCase() : 'USD';
  const image = typeof input.image === 'string' && input.image.trim() ? input.image.trim() : null;

  return {
    slug,
    name,
    quantity: safeQuantity,
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
        price: product.price,
        currency: product.currency,
        quantity: 1,
        image: product.image
      }
    ]);
  }

  const nextItems = currentItems.map((item) =>
    item.slug === product.slug ? { ...item, quantity: item.quantity + 1 } : item
  );
  return writeCartItems(nextItems);
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
