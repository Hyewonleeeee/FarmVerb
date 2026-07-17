'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import { getPaymentCopy, type PaymentApiErrorCode, type PaymentLocale } from '@/lib/i18n/payment';
import type { PurchaseRecord } from '@/lib/payments/purchases';
import { getLemonMyOrdersUrl } from '@/lib/checkout/lemonLinks';
import { getCatalogProductBySlug } from '@/lib/cart/store';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

const MY_PAGE_LOGIN_REDIRECT = '/login?redirect=%2Fmypage';

type AccountTabKey = 'products' | 'account';

type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  country: string | null;
  created_at: string | null;
};

type OrderLine = {
  id: string;
  order_id: string | null;
  product_name: string | null;
  amount: number | null;
  created_at: string;
};

type License = {
  id: string;
  order_id: string | null;
  product_name: string | null;
  license_key: string;
  created_at: string;
};

const accountTabs: { key: AccountTabKey; label: string }[] = [
  { key: 'products', label: 'My Products' },
  { key: 'account', label: 'Account' }
];

const accountSectionCopy: Record<AccountTabKey, string> = {
  products: 'Your purchased products, downloads, and license details.',
  account: 'Your sign-in email, verification status, and account access.'
};

const formatDate = (dateText: string | null | undefined) => {
  if (!dateText) {
    return '-';
  }

  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
};

const formatOrderAmount = (value: number | null | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
};

const formatCurrency = (value: number | null, currencyText: string | null | undefined, locale: PaymentLocale) => {
  if (value === null || Number.isNaN(value)) {
    return '-';
  }

  const normalizedCurrency = (currencyText ?? 'USD').trim().toUpperCase();
  const numberLocale = locale === 'ko' ? 'ko-KR' : 'en-US';
  try {
    return new Intl.NumberFormat(numberLocale, {
      style: 'currency',
      currency: normalizedCurrency,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${normalizedCurrency || 'USD'}`;
  }
};

function normalizePaymentStatus(status: string | null) {
  if (!status) {
    return 'Unknown';
  }

  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function toProductSlug(productName: string | null | undefined): string | null {
  if (!productName) {
    return null;
  }

  const normalized = productName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || null;
}

export default function MyPage() {
  const router = useRouter();
  const paymentLocale: PaymentLocale = 'en';
  const paymentCopy = getPaymentCopy(paymentLocale);
  const [activeTab, setActiveTab] = useState<AccountTabKey>('products');

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [orders, setOrders] = useState<OrderLine[]>([]);
  const [ordersMessage, setOrdersMessage] = useState('');

  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [purchasesMessage, setPurchasesMessage] = useState('');

  const [licenses, setLicenses] = useState<License[]>([]);
  const [licensesMessage, setLicensesMessage] = useState('');

  const [downloadMessage, setDownloadMessage] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [copiedLicenseId, setCopiedLicenseId] = useState<string | null>(null);

  const emailVerified = Boolean(user?.email_confirmed_at);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const uiText = getPaymentCopy(paymentLocale);
    let mounted = true;

    const loadProfile = async (currentUser: User) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, country, created_at')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (!mounted) {
        return;
      }

      if (error || !data) {
        const metadata = (currentUser.user_metadata ?? {}) as { name?: string; country?: string };
        const fallbackProfile: Profile = {
          id: currentUser.id,
          name: metadata.name ?? null,
          email: currentUser.email ?? null,
          country: metadata.country ?? null,
          created_at: currentUser.created_at ?? null
        };

        setProfile(fallbackProfile);
        return;
      }

      const loadedProfile: Profile = {
        id: data.id,
        name: data.name,
        email: data.email ?? currentUser.email ?? null,
        country: data.country,
        created_at: data.created_at ?? currentUser.created_at ?? null
      };

      setProfile(loadedProfile);
    };

    const loadOrders = async (currentUser: User) => {
      const { data: orderRows, error: ordersError } = await supabase
        .from('orders')
        .select('id, order_id, product_name, amount, created_at')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (!mounted) {
        return;
      }

      if (ordersError) {
        setOrders([]);
        setOrdersMessage(uiText.orders.loadFailed);
        return;
      }

      const normalizedOrders: OrderLine[] = (orderRows ?? []).map((row) => {
        const parsedAmount = typeof row.amount === 'number' ? row.amount : Number(row.amount);
        return {
          id: row.id,
          order_id: row.order_id ?? null,
          product_name: row.product_name ?? null,
          amount: Number.isNaN(parsedAmount) ? null : parsedAmount,
          created_at: row.created_at
        };
      });

      setOrders(normalizedOrders);
      setOrdersMessage('');
    };

    const loadPurchases = async (accessToken: string) => {
      try {
        const response = await fetch('/api/account/purchases', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`
          },
          cache: 'no-store'
        });

        const payload = (await response.json().catch(() => null)) as
          | { purchases?: PurchaseRecord[]; error?: string }
          | null;

        if (!mounted) {
          return;
        }

        if (!response.ok) {
          setPurchases([]);
          setPurchasesMessage(payload?.error ?? 'Failed to load Lemon Squeezy purchases.');
          return;
        }

        setPurchases(payload?.purchases ?? []);
        setPurchasesMessage('');
      } catch {
        if (mounted) {
          setPurchases([]);
          setPurchasesMessage('Failed to load Lemon Squeezy purchases.');
        }
      }
    };

    const loadLicenses = async (currentUser: User) => {
      const { data, error } = await supabase
        .from('licenses')
        .select('id, order_id, product_name, license_key, created_at')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (!mounted) {
        return;
      }

      if (error) {
        setLicenses([]);
        setLicensesMessage(uiText.licenses.loadFailed);
        return;
      }

      const normalizedLicenses: License[] = (data ?? []).map((row) => ({
        id: row.id,
        order_id: row.order_id ?? null,
        product_name: row.product_name ?? null,
        license_key: row.license_key,
        created_at: row.created_at
      }));

      setLicenses(normalizedLicenses);
      setLicensesMessage('');
    };

    const loadDashboardData = async (currentUser: User, accessToken: string) => {
      await Promise.all([
        loadProfile(currentUser),
        loadPurchases(accessToken),
        loadOrders(currentUser),
        loadLicenses(currentUser)
      ]);

      if (mounted) {
        setIsLoading(false);
      }
    };

    const checkSession = async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (!session) {
        router.replace(MY_PAGE_LOGIN_REDIRECT);
        return;
      }

      setUser(session.user);
      await loadDashboardData(session.user, session.access_token);
    };

    void checkSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
        setProfile(null);
        setPurchases([]);
        setOrders([]);
        setLicenses([]);
        router.replace(MY_PAGE_LOGIN_REDIRECT);
        return;
      }

      setUser(session.user);
      void loadDashboardData(session.user, session.access_token);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router, paymentLocale]);

  const handleDownload = async (productSlug: string) => {
    setDownloadMessage('');
    setIsDownloading(true);

    const supabase = createBrowserSupabaseClient();
    const {
      data: { session }
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token;
    if (!accessToken) {
      setDownloadMessage(paymentCopy.download.loginAgain);
      setIsDownloading(false);
      return;
    }

    const response = await fetch('/api/download', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ slug: productSlug })
    });

    const payload = (await response.json().catch(() => null)) as
      | { downloadUrl?: string; error?: string; errorCode?: PaymentApiErrorCode }
      | null;

    if (!response.ok) {
      const messageFromCode = payload?.errorCode ? paymentCopy.apiErrors[payload.errorCode] : '';
      setDownloadMessage(messageFromCode || payload?.error || paymentCopy.download.failed);
      setIsDownloading(false);
      return;
    }

    if (!payload?.downloadUrl) {
      setDownloadMessage(paymentCopy.download.urlMissing);
      setIsDownloading(false);
      return;
    }

    setDownloadMessage(paymentCopy.download.starting);
    window.location.assign(payload.downloadUrl);
    setIsDownloading(false);
  };

  const handleCopyLicense = async (licenseId: string, licenseKey: string) => {
    try {
      await navigator.clipboard.writeText(licenseKey);
      setCopiedLicenseId(licenseId);
      window.setTimeout(() => {
        setCopiedLicenseId((currentId) => (currentId === licenseId ? null : currentId));
      }, 1400);
    } catch {
      setDownloadMessage(paymentCopy.licenses.copyFailed);
    }
  };

  const accountJoinDate = profile?.created_at ?? user?.created_at ?? null;

  const licensesByOrderId = useMemo(() => {
    const map = new Map<string, License>();
    licenses.forEach((license) => {
      if (license.order_id) {
        map.set(license.order_id, license);
      }
    });
    return map;
  }, [licenses]);

  const licensesByProductName = useMemo(() => {
    const map = new Map<string, License>();
    licenses.forEach((license) => {
      const key = (license.product_name ?? '').trim().toLowerCase();
      if (key && !map.has(key)) {
        map.set(key, license);
      }
    });
    return map;
  }, [licenses]);

  const activeAccountTabMeta = useMemo(() => {
    return accountTabs.find((tab) => tab.key === activeTab) ?? accountTabs[0];
  }, [activeTab]);

  const lemonMyOrdersUrl = getLemonMyOrdersUrl();

  if (isLoading) {
    return (
      <div className="auth-page-shell">
        <AuthPageHeader />
        <main className="auth-page-main">
          <section className="auth-card">
            <h1 className="auth-title">Checking your session...</h1>
          </section>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-page-shell">
        <AuthPageHeader />
        <main className="auth-page-main">
          <section className="auth-card">
            <h1 className="auth-title">Redirecting...</h1>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-page-shell">
      <AuthPageHeader />

      <main className="auth-page-main">
        <section className="mypage-card mypage-dashboard" aria-label="FarmVerb account">
          <div className="mypage-dashboard-head">
            <div>
              <p className="auth-overline">My Account</p>
              <h1 className="auth-title">My Account</h1>
              <p className="auth-copy">Access your products, downloads, licenses, and account details.</p>
            </div>
          </div>

          <div className="mypage-dashboard-layout">
            <aside className="mypage-sidebar" aria-label="My Account navigation">
              <nav className="mypage-sidebar-nav" role="tablist" aria-orientation="vertical">
                {accountTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.key}
                    className={`mypage-sidebar-item ${activeTab === tab.key ? 'is-active' : ''}`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </aside>

            <section className="mypage-panel mypage-panel-dashboard" role="tabpanel">
              <header className="mypage-content-head">
                <p className="mypage-content-overline">My Account</p>
                <h2 className="mypage-content-title">{activeAccountTabMeta.label}</h2>
                <p className="mypage-content-copy">{accountSectionCopy[activeAccountTabMeta.key]}</p>
              </header>

              {activeTab === 'account' ? (
                <section className="mypage-account-view mypage-account-summary" aria-label="Account access details">
                  <div className="mypage-account-identity">
                    <span className="mypage-account-label">Signed in as</span>
                    <strong>{profile?.email || user.email || '-'}</strong>
                    <span className={`mypage-account-badge ${emailVerified ? 'is-verified' : 'is-pending'}`}>
                      {emailVerified ? 'Verified email' : 'Verification pending'}
                    </span>
                  </div>

                  <div className="mypage-account-facts">
                    <div className="mypage-account-fact">
                      <span>Member since</span>
                      <strong>{formatDate(accountJoinDate)}</strong>
                    </div>
                    <div className="mypage-account-fact">
                      <span>Sign-in method</span>
                      <strong>Email one-time code</strong>
                    </div>
                  </div>

                  <p className="mypage-account-note">
                    You sign in securely using a one-time code sent to this email address.
                  </p>
                </section>
              ) : null}

              {activeTab === 'products' ? (
                <>
                  <section className="mypage-purchase-section" aria-labelledby="lemon-purchases-title">
                    <h3 id="lemon-purchases-title" className="mypage-subsection-title">Purchased Products</h3>
                    <p className="mypage-subsection-copy">Products verified through Lemon Squeezy appear here with their downloads and license details.</p>

                    {purchasesMessage ? <p className="auth-message is-error">{purchasesMessage}</p> : null}

                    {!purchasesMessage && purchases.length === 0 && orders.length === 0 ? (
                      <div className="mypage-empty-products">
                        <strong>You don&apos;t own any products yet.</strong>
                        <p>Your FarmVerb products will appear here after purchase.</p>
                        <Link href="/plugins" className="auth-submit mypage-small-button">
                          Browse Plugins
                        </Link>
                      </div>
                    ) : null}

                    {purchases.length > 0 ? (
                      <ul className="mypage-list">
                        {purchases.map((purchase) => {
                          const productImage = purchase.product_slug
                            ? getCatalogProductBySlug(purchase.product_slug)?.image ?? null
                            : null;

                          return (
                            <li key={purchase.id} className="mypage-list-item mypage-product-item">
                              {productImage ? (
                                <figure className="mypage-product-media">
                                  <img src={productImage} alt="" />
                                </figure>
                              ) : null}
                              <div className="mypage-product-copy">
                                <div className="mypage-item-head">{purchase.product_name}</div>
                                <div className="mypage-meta-row">
                                  Purchased · {formatDate(purchase.purchased_at)}
                                </div>
                                <div className="mypage-meta-row">
                                  {formatCurrency(purchase.total_cents / 100, purchase.currency, paymentLocale)} · {normalizePaymentStatus(purchase.status)}
                                </div>
                                <div className="mypage-meta-row">Order ID: {purchase.lemon_order_id}</div>

                                {purchase.lemon_license_key ? (
                                  <div className="mypage-license-row">
                                    <span className="mypage-meta-label">License</span>
                                    <code className="mypage-license-key">{purchase.lemon_license_key}</code>
                                    <button
                                      type="button"
                                      className="auth-submit auth-submit-secondary mypage-small-button"
                                      onClick={() => void handleCopyLicense(purchase.id, purchase.lemon_license_key ?? '')}
                                    >
                                      {copiedLicenseId === purchase.id ? paymentCopy.licenses.copied : paymentCopy.licenses.copy}
                                    </button>
                                  </div>
                                ) : (
                                  <div className="mypage-meta-row">License is being issued.</div>
                                )}

                                <div className="mypage-product-actions">
                                  {purchase.download_url ? (
                                    <a
                                      href={purchase.download_url}
                                      className="auth-submit mypage-small-button"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      Download
                                    </a>
                                  ) : (
                                    <span className="mypage-meta-row">Download will appear when available.</span>
                                  )}
                                </div>

                                {!purchase.product_slug ? (
                                  <div className="mypage-meta-row">Product mapping is pending.</div>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </section>

                  {orders.length > 0 || ordersMessage || licensesMessage ? (
                    <section className="mypage-purchase-section" aria-labelledby="legacy-orders-title">
                      <h3 id="legacy-orders-title" className="mypage-subsection-title">Previous FarmVerb Products</h3>
                      <p className="mypage-subsection-copy">Products purchased through the earlier FarmVerb order system.</p>

                      {ordersMessage ? <p>{ordersMessage}</p> : null}
                      {!ordersMessage && licensesMessage ? <p>{licensesMessage}</p> : null}

                      {orders.length > 0 ? (
                        <ul className="mypage-list">
                          {orders.map((order) => {
                            const byOrder = order.order_id ? licensesByOrderId.get(order.order_id) : undefined;
                            const byProduct = licensesByProductName.get((order.product_name ?? '').trim().toLowerCase());
                            const license = byOrder ?? byProduct ?? null;
                            const productSlug = toProductSlug(order.product_name);
                            const productImage = productSlug ? getCatalogProductBySlug(productSlug)?.image ?? null : null;

                            return (
                              <li key={order.id} className="mypage-list-item mypage-product-item">
                                {productImage ? (
                                  <figure className="mypage-product-media">
                                    <img src={productImage} alt="" />
                                  </figure>
                                ) : null}
                                <div className="mypage-product-copy">
                                  <div className="mypage-item-head">{order.product_name ?? paymentCopy.orders.unknownProduct}</div>
                                  <div className="mypage-meta-row">
                                    Purchased · {formatDate(order.created_at)}
                                  </div>
                                  <div className="mypage-meta-row">
                                    {formatOrderAmount(order.amount)} · Order ID: {order.order_id ?? '-'}
                                  </div>

                                  {license ? (
                                    <div className="mypage-license-row">
                                      <span className="mypage-meta-label">{paymentCopy.licenses.label}</span>
                                      <code className="mypage-license-key">{license.license_key}</code>
                                      <button
                                        type="button"
                                        className="auth-submit auth-submit-secondary mypage-small-button"
                                        onClick={() => void handleCopyLicense(license.id, license.license_key)}
                                      >
                                        {copiedLicenseId === license.id ? paymentCopy.licenses.copied : paymentCopy.licenses.copy}
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="mypage-meta-row">License is being issued.</div>
                                  )}

                                  {productSlug ? (
                                    <button
                                      type="button"
                                      className="auth-submit mypage-small-button"
                                      onClick={() => void handleDownload(productSlug)}
                                      disabled={isDownloading}
                                    >
                                      {isDownloading ? paymentCopy.licenses.preparing : paymentCopy.licenses.download}
                                    </button>
                                  ) : null}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </section>
                  ) : null}

                  {lemonMyOrdersUrl ? (
                    <a
                      href={lemonMyOrdersUrl}
                      className="auth-submit auth-submit-secondary mypage-manage-orders"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Manage Orders
                    </a>
                  ) : null}

                  {downloadMessage ? <p className="mypage-inline-message">{downloadMessage}</p> : null}
                </>
              ) : null}

            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
