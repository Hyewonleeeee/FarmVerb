export type LemonSqueezyBrowser = {
  LemonSqueezy?: {
    Refresh?: () => void;
    Url?: {
      Open?: (url: string) => void;
      Close?: () => void;
    };
  };
  createLemonSqueezy?: () => void;
};

export function initializeLemonSqueezy(target: LemonSqueezyBrowser | undefined) {
  if (!target) {
    return false;
  }

  try {
    const isAlreadyInitialized = typeof target.LemonSqueezy?.Url?.Open === 'function';
    if (!isAlreadyInitialized) {
      target.createLemonSqueezy?.();
    }
    target.LemonSqueezy?.Refresh?.();
    return typeof target.LemonSqueezy?.Url?.Open === 'function';
  } catch {
    return false;
  }
}

export function tryOpenLemonCheckout(
  checkoutUrl: string,
  target: LemonSqueezyBrowser | undefined
) {
  const open = target?.LemonSqueezy?.Url?.Open;
  if (typeof open !== 'function') {
    return false;
  }

  try {
    open(checkoutUrl);
    return true;
  } catch {
    return false;
  }
}
