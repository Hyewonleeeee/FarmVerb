'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import {
  parseBlackFridayPreviewVariant,
  type BlackFridayPreviewVariant
} from '@/lib/campaigns/blackFriday2026';

const VARIANT_QUERY_KEY = 'bf';
const VARIANT_STORAGE_KEY = 'farmverb.black-friday-2026.variant';

type BlackFridayPreviewContextValue = {
  enabled: boolean;
  variant: BlackFridayPreviewVariant;
  setVariant: (variant: BlackFridayPreviewVariant) => void;
};

const BlackFridayPreviewContext = createContext<BlackFridayPreviewContextValue>({
  enabled: false,
  variant: 'editorial',
  setVariant: () => undefined
});

function readStoredVariant() {
  try {
    return parseBlackFridayPreviewVariant(window.sessionStorage.getItem(VARIANT_STORAGE_KEY));
  } catch {
    return null;
  }
}

function storeVariant(variant: BlackFridayPreviewVariant) {
  try {
    window.sessionStorage.setItem(VARIANT_STORAGE_KEY, variant);
  } catch {
    // The comparison remains usable in restricted/private browser contexts.
  }
}

export function useBlackFridayPreview() {
  return useContext(BlackFridayPreviewContext);
}

export default function BlackFridayPreviewProvider({
  enabled,
  children
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [variant, setVariantState] = useState<BlackFridayPreviewVariant>('editorial');

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const queryVariant = parseBlackFridayPreviewVariant(
      new URLSearchParams(window.location.search).get(VARIANT_QUERY_KEY)
    );
    const storedVariant = readStoredVariant();
    const nextVariant = queryVariant ?? storedVariant ?? 'editorial';
    setVariantState(nextVariant);
    storeVariant(nextVariant);
  }, [enabled]);

  const setVariant = useCallback((nextVariant: BlackFridayPreviewVariant) => {
    setVariantState(nextVariant);
    storeVariant(nextVariant);

    const url = new URL(window.location.href);
    url.searchParams.set(VARIANT_QUERY_KEY, nextVariant);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const value = useMemo(
    () => ({ enabled, variant, setVariant }),
    [enabled, setVariant, variant]
  );

  return (
    <BlackFridayPreviewContext.Provider value={value}>
      {children}
    </BlackFridayPreviewContext.Provider>
  );
}
