'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import { getPaymentCopy, type PaymentApiErrorCode, type PaymentLocale } from '@/lib/i18n/payment';
import CountrySelect from '@/components/ui/CountrySelect';
import { getMagicLinkErrorMessage, getMagicLinkRedirectUrl } from '@/lib/auth/magic-link';
import type { PurchaseRecord } from '@/lib/payments/purchases';
import { normalizeCountryName } from '@/lib/ui/country';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

const MY_PAGE_LOGIN_REDIRECT = '/login?redirect=%2Fmypage';

type DashboardTabKey = 'account' | 'orders' | 'security';

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

const dashboardTabs: { key: DashboardTabKey; label: string }[] = [
  { key: 'account', label: 'Account Info' },
  { key: 'orders', label: 'Orders / Purchase History' },
  { key: 'security', label: 'Security' }
];

const dashboardSectionCopy: Record<DashboardTabKey, string> = {
  account: 'Personal details and account profile settings.',
  orders: 'Lemon Squeezy purchases plus existing FarmVerb order and license records.',
  security: 'Email verification and passwordless Magic Link access.'
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

const normalizeOptionalCountryName = (country: string | null | undefined) => {
  const trimmedCountry = (country ?? '').trim();
  return trimmedCountry ? normalizeCountryName(trimmedCountry) : '';
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
  const isLoggingOutRef = useRef(false);

  const [activeTab, setActiveTab] = useState<DashboardTabKey>('account');

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [orders, setOrders] = useState<OrderLine[]>([]);
  const [ordersMessage, setOrdersMessage] = useState('');

  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [purchasesMessage, setPurchasesMessage] = useState('');

  const [licenses, setLicenses] = useState<License[]>([]);
  const [licensesMessage, setLicensesMessage] = useState('');

  const [isAccountEditMode, setIsAccountEditMode] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [countryInput, setCountryInput] = useState('');
  const [accountMessage, setAccountMessage] = useState('');
  const [accountMessageType, setAccountMessageType] = useState<'error' | 'success' | ''>('');
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  const [downloadMessage, setDownloadMessage] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [copiedLicenseId, setCopiedLicenseId] = useState<string | null>(null);

  const [securityMessage, setSecurityMessage] = useState('');
  const [securityMessageType, setSecurityMessageType] = useState<'error' | 'success' | ''>('');
  const [isSendingMagicLink, setIsSendingMagicLink] = useState(false);

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
        setNameInput(fallbackProfile.name ?? '');
        setCountryInput(normalizeOptionalCountryName(fallbackProfile.country));
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
      setNameInput(loadedProfile.name ?? '');
      setCountryInput(normalizeOptionalCountryName(loadedProfile.country));
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

      isLoggingOutRef.current = false;
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
        setIsAccountEditMode(false);
        router.replace(isLoggingOutRef.current ? '/' : MY_PAGE_LOGIN_REDIRECT);
        return;
      }

      isLoggingOutRef.current = false;
      setUser(session.user);
      void loadDashboardData(session.user, session.access_token);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router, paymentLocale]);

  const handleLogout = async () => {
    const supabase = createBrowserSupabaseClient();
    isLoggingOutRef.current = true;
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.assign('/');
    }
  };

  const handleStartEdit = () => {
    setAccountMessage('');
    setAccountMessageType('');
    setIsAccountEditMode(true);
  };

  const handleCancelEdit = () => {
    setNameInput(profile?.name ?? '');
    setCountryInput(normalizeOptionalCountryName(profile?.country));
    setAccountMessage('');
    setAccountMessageType('');
    setIsAccountEditMode(false);
  };

  const handleSaveProfile = async () => {
    if (!user) {
      return;
    }

    setIsSavingAccount(true);
    setAccountMessage('');
    setAccountMessageType('');

    const supabase = createBrowserSupabaseClient();
    const trimmedName = nameInput.trim();
    const trimmedCountry = normalizeOptionalCountryName(countryInput);

    const nextProfile = {
      id: user.id,
      email: user.email ?? '',
      name: trimmedName || null,
      country: trimmedCountry || null
    };

    const { error } = await supabase.from('profiles').upsert(nextProfile, { onConflict: 'id' });

    if (error) {
      setAccountMessage(`Failed to save profile: ${error.message}`);
      setAccountMessageType('error');
      setIsSavingAccount(false);
      return;
    }

    setProfile((prev) => ({
      id: prev?.id ?? user.id,
      email: nextProfile.email || null,
      name: nextProfile.name,
      country: nextProfile.country,
      created_at: prev?.created_at ?? user.created_at ?? null
    }));

    setNameInput(nextProfile.name ?? '');
    setCountryInput(nextProfile.country ?? '');
    setAccountMessage('Account information updated.');
    setAccountMessageType('success');
    setIsAccountEditMode(false);
    setIsSavingAccount(false);
  };

  const handleSendMagicLink = async () => {
    if (!user?.email) {
      setSecurityMessage('Email address not found for this account.');
      setSecurityMessageType('error');
      return;
    }

    setIsSendingMagicLink(true);
    setSecurityMessage('');
    setSecurityMessageType('');

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: user.email,
        options: {
          emailRedirectTo: getMagicLinkRedirectUrl(),
          shouldCreateUser: false
        }
      });

      if (error) {
        setSecurityMessage(getMagicLinkErrorMessage(error));
        setSecurityMessageType('error');
        setIsSendingMagicLink(false);
        return;
      }

      setSecurityMessage('A new Magic Link was sent. Please check your inbox.');
      setSecurityMessageType('success');
      setIsSendingMagicLink(false);
    } catch (error) {
      setSecurityMessage(getMagicLinkErrorMessage(error));
      setSecurityMessageType('error');
      setIsSendingMagicLink(false);
    }
  };

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

  const activeDashboardTabMeta = useMemo(() => {
    return dashboardTabs.find((tab) => tab.key === activeTab) ?? dashboardTabs[0];
  }, [activeTab]);

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
        <section className="mypage-card mypage-dashboard" aria-label="FarmVerb account dashboard">
          <div className="mypage-dashboard-head">
            <div>
              <p className="auth-overline">My Account</p>
              <h1 className="auth-title">Dashboard</h1>
              <p className="auth-copy">Manage account, purchases, licenses, and security in one place.</p>
            </div>

            <button type="button" className="auth-submit auth-submit-secondary mypage-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>

          <div className="mypage-dashboard-layout">
            <aside className="mypage-sidebar" aria-label="My Page navigation">
              <nav className="mypage-sidebar-nav" role="tablist" aria-orientation="vertical">
                {dashboardTabs.map((tab) => (
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
                <p className="mypage-content-overline">Dashboard</p>
                <h2 className="mypage-content-title">{activeDashboardTabMeta.label}</h2>
                <p className="mypage-content-copy">{dashboardSectionCopy[activeDashboardTabMeta.key]}</p>
              </header>

              {activeTab === 'account' ? (
                <>
                  {!isAccountEditMode ? (
                    <section className="mypage-account-view" aria-label="Account details">
                      <div className="mypage-account-row">
                        <span className="mypage-account-label">Name</span>
                        <strong className="mypage-account-value">{profile?.name || '-'}</strong>
                      </div>
                      <div className="mypage-account-row">
                        <span className="mypage-account-label">Email</span>
                        <strong className="mypage-account-value">{profile?.email || user.email || '-'}</strong>
                      </div>
                      <div className="mypage-account-row">
                        <span className="mypage-account-label">Country</span>
                        <strong className="mypage-account-value">{countryInput || '-'}</strong>
                      </div>
                      <div className="mypage-account-row">
                        <span className="mypage-account-label">Join Date</span>
                        <strong className="mypage-account-value">{formatDate(accountJoinDate)}</strong>
                      </div>

                      <button type="button" className="auth-submit" onClick={handleStartEdit}>
                        Edit
                      </button>
                    </section>
                  ) : (
                    <form
                      className="auth-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleSaveProfile();
                      }}
                    >
                      <div className="mypage-account-row">
                        <span className="mypage-account-label">Email</span>
                        <strong className="mypage-account-value">{profile?.email || user.email || '-'}</strong>
                      </div>
                      <div className="mypage-account-row">
                        <span className="mypage-account-label">Join Date</span>
                        <strong className="mypage-account-value">{formatDate(accountJoinDate)}</strong>
                      </div>

                      <label className="auth-label" htmlFor="account-name">
                        Name
                      </label>
                      <input
                        id="account-name"
                        className="auth-input"
                        type="text"
                        autoComplete="name"
                        value={nameInput}
                        onChange={(event) => setNameInput(event.target.value)}
                        disabled={isSavingAccount}
                      />

                      <label className="auth-label" htmlFor="account-country">
                        Country
                      </label>
                      <CountrySelect
                        id="account-country"
                        value={countryInput}
                        onChange={setCountryInput}
                        disabled={isSavingAccount}
                      />

                      <div className="mypage-form-actions">
                        <button
                          type="button"
                          className="auth-submit auth-submit-secondary"
                          onClick={handleCancelEdit}
                          disabled={isSavingAccount}
                        >
                          Cancel
                        </button>
                        <button type="submit" className="auth-submit" disabled={isSavingAccount}>
                          {isSavingAccount ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </form>
                  )}

                  {accountMessage ? (
                    <p className={`auth-message ${accountMessageType === 'error' ? 'is-error' : 'is-success'}`}>
                      {accountMessage}
                    </p>
                  ) : null}
                </>
              ) : null}

              {activeTab === 'orders' ? (
                <>
                  <section className="mypage-purchase-section" aria-labelledby="lemon-purchases-title">
                    <h3 id="lemon-purchases-title" className="mypage-subsection-title">My Purchases</h3>
                    <p className="mypage-subsection-copy">Purchases verified through Lemon Squeezy.</p>

                    {purchasesMessage ? <p className="auth-message is-error">{purchasesMessage}</p> : null}

                    {!purchasesMessage && purchases.length === 0 ? (
                      <p>No Lemon Squeezy purchases linked yet.</p>
                    ) : null}

                    {purchases.length > 0 ? (
                      <ul className="mypage-list">
                        {purchases.map((purchase) => (
                          <li key={purchase.id} className="mypage-list-item">
                            <div className="mypage-item-head">{purchase.product_name}</div>
                            <div className="mypage-meta-row">
                              Amount: {formatCurrency(purchase.total_cents / 100, purchase.currency, paymentLocale)}
                            </div>
                            <div className="mypage-meta-row">
                              Purchased: {formatDate(purchase.purchased_at)}
                            </div>
                            <div className="mypage-meta-row">
                              Order ID: {purchase.lemon_order_id}
                            </div>
                            <div className="mypage-meta-row">
                              Status: {normalizePaymentStatus(purchase.status)}
                            </div>
                            {!purchase.product_slug ? (
                              <div className="mypage-meta-row">Product mapping is pending.</div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>

                  {orders.length > 0 || ordersMessage || licensesMessage ? (
                    <section className="mypage-purchase-section" aria-labelledby="legacy-orders-title">
                      <h3 id="legacy-orders-title" className="mypage-subsection-title">Legacy Orders / Licenses</h3>
                      <p className="mypage-subsection-copy">Existing FarmVerb records are preserved during migration.</p>

                      {ordersMessage ? <p>{ordersMessage}</p> : null}
                      {!ordersMessage && licensesMessage ? <p>{licensesMessage}</p> : null}

                      {orders.length > 0 ? (
                        <ul className="mypage-list">
                          {orders.map((order) => {
                            const byOrder = order.order_id ? licensesByOrderId.get(order.order_id) : undefined;
                            const byProduct = licensesByProductName.get((order.product_name ?? '').trim().toLowerCase());
                            const license = byOrder ?? byProduct ?? null;
                            const productSlug = toProductSlug(order.product_name);

                            return (
                              <li key={order.id} className="mypage-list-item">
                                <div className="mypage-item-head">{order.product_name ?? paymentCopy.orders.unknownProduct}</div>
                                <div className="mypage-meta-row">
                                  Amount: {formatOrderAmount(order.amount)}
                                </div>
                                <div className="mypage-meta-row">
                                  Purchased: {formatDate(order.created_at)}
                                </div>
                                <div className="mypage-meta-row">
                                  Order ID: {order.order_id ?? '-'}
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
                                  <div className="mypage-meta-row">License will be issued soon.</div>
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
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </section>
                  ) : null}

                  {downloadMessage ? <p className="mypage-inline-message">{downloadMessage}</p> : null}
                </>
              ) : null}

              {activeTab === 'security' ? (
                <>
                  <div className="mypage-security-stack">
                    <div className="mypage-security-block">
                      <div className="mypage-item-head">Email Verification</div>
                      <div className="mypage-meta-row">
                        Status:{' '}
                        <strong className={`mypage-status ${emailVerified ? 'is-ok' : 'is-pending'}`}>
                          {emailVerified ? 'Verified' : 'Not verified'}
                        </strong>
                      </div>

                    </div>

                    <div className="mypage-security-block">
                      <div className="mypage-item-head">Passwordless Sign-In</div>
                      <p className="mypage-meta-row">
                        FarmVerb uses secure Magic Links instead of passwords. Request a new link whenever you need to sign in again.
                      </p>
                      <button
                        type="button"
                        className="auth-submit mypage-small-button"
                        onClick={() => void handleSendMagicLink()}
                        disabled={isSendingMagicLink}
                      >
                        {isSendingMagicLink ? 'Sending...' : 'Send New Magic Link'}
                      </button>
                    </div>
                  </div>

                  {securityMessage ? (
                    <p className={`auth-message ${securityMessageType === 'error' ? 'is-error' : 'is-success'}`}>
                      {securityMessage}
                    </p>
                  ) : null}
                </>
              ) : null}
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
