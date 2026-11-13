'use client';

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode
} from 'react';

type BlackFridayPreviewContextValue = {
  enabled: boolean;
};

const BlackFridayPreviewContext = createContext<BlackFridayPreviewContextValue>({
  enabled: false
});

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
  const value = useMemo(() => ({ enabled }), [enabled]);

  return (
    <BlackFridayPreviewContext.Provider value={value}>
      {children}
    </BlackFridayPreviewContext.Provider>
  );
}
