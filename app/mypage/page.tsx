'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import MyProductsAccordion from '@/components/account/MyProductsAccordion';
import { getPaymentCopy, type PaymentApiErrorCode, type PaymentLocale } from '@/lib/i18n/payment';
import type {
  AccountPurchase,
  PurchaseDownloadCategory,
  PurchaseDownloadFile,
  PurchaseDownloadGroup,
  PurchaseDownloadsResponse,
  PurchaseDownloadUrlResponse,
  PurchaseLicense,
  PurchaseLicenseInstanceDeactivateResponse,
  PurchaseLicensesResponse,
} from '@/lib/payments/purchases';
import { getLemonMyOrdersUrl } from '@/lib/checkout/lemonLinks';
import { getCatalogProductBySlug, removePurchasedCartItems } from '@/lib/cart/store';
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

type PurchaseEntitlementState = {
  licenses: PurchaseLicense[];
  downloadGroups: PurchaseDownloadGroup[];
  licenseError: string;
  downloadError: string;
  loading: boolean;
};

type AccountApiError = {
  ok?: false;
  error?: string;
  errorCode?: string;
};

type CategorizedDownload = {
  group: PurchaseDownloadGroup;
  file: PurchaseDownloadFile;
};

type DeviceMessage = {
  text: string;
  isError: boolean;
};

const downloadCategoryMeta: Array<{
  category: PurchaseDownloadCategory;
  label: string;
}> = [
  { category: 'macos', label: 'macOS' },
  { category: 'windows', label: 'Windows' },
  { category: 'manual', label: 'User Manual' },
  { category: 'other', label: 'Other Downloads' }
];

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

const formatActivatedDate = (dateText: string | null | undefined) => {
  if (!dateText) {
    return 'Activation date unavailable';
  }

  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) {
    return 'Activation date unavailable';
  }

  return `Activated ${new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date)}`;
};

function categorizeDownloads(downloadGroups: PurchaseDownloadGroup[]) {
  const files = downloadGroups.flatMap((group) =>
    group.files.map((file) => ({ group, file } satisfies CategorizedDownload))
  );

  return downloadCategoryMeta
    .map((meta) => ({
      ...meta,
      files: files.filter(({ file }) => file.category === meta.category)
    }))
    .filter((group) => group.files.length > 0);
}

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

  const [purchases, setPurchases] = useState<AccountPurchase[]>([]);
  const [purchasesMessage, setPurchasesMessage] = useState('');
  const [purchaseEntitlements, setPurchaseEntitlements] = useState<Record<string, PurchaseEntitlementState>>({});

  const [licenses, setLicenses] = useState<License[]>([]);
  const [licensesMessage, setLicensesMessage] = useState('');

  const [downloadMessage, setDownloadMessage] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [activeLemonDownloadId, setActiveLemonDownloadId] = useState<string | null>(null);
  const [copiedLicenseId, setCopiedLicenseId] = useState<string | null>(null);
  const [activeDeviceActionId, setActiveDeviceActionId] = useState<string | null>(null);
  const [deviceMessages, setDeviceMessages] = useState<Record<string, DeviceMessage>>({});

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

    const loadPurchaseEntitlements = async (purchaseRows: AccountPurchase[], accessToken: string) => {
      const eligiblePurchases = purchaseRows.filter((purchase) => purchase.status === 'paid');
      if (eligiblePurchases.length === 0) {
        if (mounted) {
          setPurchaseEntitlements({});
        }
        return;
      }

      if (mounted) {
        setPurchaseEntitlements(
          Object.fromEntries(
            eligiblePurchases.map((purchase) => [
              purchase.id,
              {
                licenses: [],
                downloadGroups: [],
                licenseError: '',
                downloadError: '',
                loading: true
              }
            ])
          )
        );
      }

      const results = await Promise.all(
        eligiblePurchases.map(async (purchase) => {
          const requestOptions: RequestInit = {
            method: 'GET',
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: 'no-store'
          };

          const requestJson = async <T,>(url: string) => {
            try {
              const response = await fetch(url, requestOptions);
              const payload = (await response.json().catch(() => null)) as T | AccountApiError | null;
              if (!response.ok) {
                return { data: null as T | null, error: (payload as AccountApiError | null)?.error ?? 'Request failed.' };
              }
              return { data: payload as T, error: '' };
            } catch {
              return { data: null as T | null, error: 'Could not connect to purchase services.' };
            }
          };

          const purchasePath = encodeURIComponent(purchase.id);
          const [licenseResult, downloadResult] = await Promise.all([
            requestJson<PurchaseLicensesResponse>(`/api/account/purchases/${purchasePath}/licenses`),
            requestJson<PurchaseDownloadsResponse>(`/api/account/purchases/${purchasePath}/downloads`)
          ]);

          return {
            purchaseId: purchase.id,
            state: {
              licenses: licenseResult.data?.licenses ?? [],
              downloadGroups: downloadResult.data?.groups ?? [],
              licenseError: licenseResult.error,
              downloadError: downloadResult.error,
              loading: false
            } satisfies PurchaseEntitlementState
          };
        })
      );

      if (mounted) {
        setPurchaseEntitlements(
          Object.fromEntries(results.map((result) => [result.purchaseId, result.state]))
        );
      }
    };

    const loadPurchases = async (currentUser: User, accessToken: string) => {
      try {
        const response = await fetch('/api/account/purchases', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`
          },
          cache: 'no-store'
        });

        const payload = (await response.json().catch(() => null)) as
          | { purchases?: AccountPurchase[]; error?: string }
          | null;

        if (!mounted) {
          return;
        }

        if (!response.ok) {
          setPurchases([]);
          setPurchasesMessage(payload?.error ?? 'Failed to load Lemon Squeezy purchases.');
          return;
        }

        const loadedPurchases = payload?.purchases ?? [];
        setPurchases(loadedPurchases);
        removePurchasedCartItems(
          currentUser.id,
          loadedPurchases
            .filter((purchase) => purchase.status === 'paid' && Boolean(purchase.product_slug))
            .map((purchase) => purchase.product_slug as string)
        );
        setPurchasesMessage('');
        void loadPurchaseEntitlements(loadedPurchases, accessToken);
      } catch {
        if (mounted) {
          setPurchases([]);
          setPurchaseEntitlements({});
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
        loadPurchases(currentUser, accessToken),
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
        setPurchaseEntitlements({});
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

  const handleLemonDownload = async (purchaseId: string, fileId: string) => {
    const downloadId = `${purchaseId}:${fileId}`;
    setDownloadMessage('');
    setActiveLemonDownloadId(downloadId);

    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setDownloadMessage(paymentCopy.download.loginAgain);
        return;
      }

      const response = await fetch(`/api/account/purchases/${encodeURIComponent(purchaseId)}/downloads`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileId }),
        cache: 'no-store'
      });

      const payload = (await response.json().catch(() => null)) as
        | PurchaseDownloadUrlResponse
        | AccountApiError
        | null;

      if (!response.ok || !payload || !('downloadUrl' in payload)) {
        setDownloadMessage(
          (payload as AccountApiError | null)?.error ?? 'Could not prepare this download.'
        );
        return;
      }

      setDownloadMessage(paymentCopy.download.starting);
      window.location.assign(payload.downloadUrl);
    } catch {
      setDownloadMessage('Could not connect to purchase services.');
    } finally {
      setActiveLemonDownloadId(null);
    }
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

  const handleDeactivateDevice = async (
    purchaseId: string,
    licenseId: string,
    instanceIdentifier: string,
    deviceName: string
  ) => {
    const confirmed = window.confirm(
      `Deactivate ${deviceName}? You will need to activate the license again before using this device.`
    );
    if (!confirmed) {
      return;
    }

    const actionId = `${purchaseId}:${licenseId}:${instanceIdentifier}`;
    const messageId = `${purchaseId}:${licenseId}`;
    setActiveDeviceActionId(actionId);
    setDeviceMessages((current) => {
      const next = { ...current };
      delete next[messageId];
      return next;
    });

    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setDeviceMessages((current) => ({
          ...current,
          [messageId]: { text: paymentCopy.download.loginAgain, isError: true }
        }));
        return;
      }

      const response = await fetch(
        `/api/account/purchases/${encodeURIComponent(purchaseId)}/licenses/${encodeURIComponent(licenseId)}/instances`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ instanceIdentifier }),
          cache: 'no-store'
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | PurchaseLicenseInstanceDeactivateResponse
        | AccountApiError
        | null;

      if (!response.ok || !payload || !('instances' in payload)) {
        setDeviceMessages((current) => ({
          ...current,
          [messageId]: {
            text: (payload as AccountApiError | null)?.error ?? 'Could not deactivate this device.',
            isError: true
          }
        }));
        return;
      }

      setPurchaseEntitlements((current) => {
        const currentPurchase = current[purchaseId];
        if (!currentPurchase) {
          return current;
        }

        return {
          ...current,
          [purchaseId]: {
            ...currentPurchase,
            licenses: currentPurchase.licenses.map((license) =>
              license.id === licenseId
                ? { ...license, instances: payload.instances, instancesCount: payload.instances.length }
                : license
            )
          }
        };
      });
      setDeviceMessages((current) => ({
        ...current,
        [messageId]: { text: `${deviceName} was deactivated.`, isError: false }
      }));
    } catch {
      setDeviceMessages((current) => ({
        ...current,
        [messageId]: { text: 'Could not connect to license services.', isError: true }
      }));
    } finally {
      setActiveDeviceActionId(null);
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
                          const entitlement = purchaseEntitlements[purchase.id];
                          const categorizedDownloadGroups = categorizeDownloads(
                            entitlement?.downloadGroups ?? []
                          );
                          const deviceCount = entitlement?.licenses.reduce(
                            (total, license) => total + license.instances.length,
                            0
                          ) ?? 0;
                          const isBundle = purchase.product_slug === 'nebula-series'
                            || purchase.product_slug === 'organic-series'
                            || purchase.product_name.trim().toLowerCase().endsWith('bundle');
                          const bundleInstallerVariantId = entitlement?.downloadGroups[0]?.variantId ?? null;
                          const installerGroups = categorizedDownloadGroups
                            .filter((group) => group.category === 'macos' || group.category === 'windows')
                            .map((group) => ({
                              ...group,
                              files: isBundle
                                ? group.files.filter(({ group: fileGroup }) => (
                                    fileGroup.variantId === bundleInstallerVariantId
                                  ))
                                : group.files
                            }))
                            .filter((group) => group.files.length > 0);
                          const manualGroup = categorizedDownloadGroups.find(
                            (group) => group.category === 'manual'
                          );
                          const otherGroup = categorizedDownloadGroups.find(
                            (group) => group.category === 'other'
                          );
                          const downloadCount = isBundle
                            ? installerGroups.reduce((total, group) => total + group.files.length, 0)
                              + (manualGroup?.files.length ?? 0)
                              + (otherGroup?.files.length ?? 0)
                            : categorizedDownloadGroups.reduce(
                                (total, group) => total + group.files.length,
                                0
                              );

                          const renderDownloadFiles = (files: CategorizedDownload[]) => (
                            <div className="mypage-download-group-files">
                              {files.map(({ group, file }) => {
                                const downloadId = `${purchase.id}:${file.id}`;
                                return (
                                  <div key={`${group.orderItemId}:${file.id}`} className="mypage-download-row">
                                    <div className="mypage-download-copy">
                                      <strong title={file.displayName}>{file.displayName}</strong>
                                      {entitlement && entitlement.downloadGroups.length > 1 ? (
                                        <span>{group.productName}</span>
                                      ) : null}
                                      {file.version ? <span>Version {file.version}</span> : null}
                                    </div>
                                    <button
                                      type="button"
                                      className="auth-submit mypage-small-button"
                                      onClick={() => void handleLemonDownload(purchase.id, file.id)}
                                      disabled={activeLemonDownloadId === downloadId}
                                      aria-label={`Download ${file.displayName}`}
                                    >
                                      {activeLemonDownloadId === downloadId ? 'Preparing...' : 'Download'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          );

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

                                <div
                                  className="mypage-entitlement-list"
                                  role="group"
                                  aria-label={`${purchase.product_name} product access`}
                                >
                                  <MyProductsAccordion
                                    sectionId={`purchase-${purchase.id}-license`}
                                    title="License"
                                    defaultOpen
                                  >
                                  {entitlement?.loading ? (
                                    <p className="mypage-entitlement-message">Checking your license...</p>
                                  ) : entitlement?.licenseError ? (
                                    <p className="mypage-entitlement-message is-error">{entitlement.licenseError}</p>
                                  ) : entitlement?.licenses.length ? (
                                    <div className="mypage-license-list">
                                      {entitlement.licenses.map((license) => {
                                        const copyId = `${purchase.id}:${license.id}`;
                                        return (
                                          <article key={license.id} className="mypage-license-card">
                                            {entitlement.licenses.length > 1 && license.productName ? (
                                              <p className="mypage-license-product">{license.productName}</p>
                                            ) : null}
                                            <div className="mypage-license-row">
                                              <code className="mypage-license-key">{license.key}</code>
                                              <button
                                                type="button"
                                                className="auth-submit auth-submit-secondary mypage-small-button"
                                                onClick={() => void handleCopyLicense(copyId, license.key)}
                                              >
                                                {copiedLicenseId === copyId ? paymentCopy.licenses.copied : paymentCopy.licenses.copy}
                                              </button>
                                            </div>
                                          </article>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <p className="mypage-entitlement-message">License is being issued.</p>
                                  )}
                                  </MyProductsAccordion>

                                  <MyProductsAccordion
                                    sectionId={`purchase-${purchase.id}-devices`}
                                    title="Manage Devices"
                                    count={entitlement && !entitlement.loading && !entitlement.licenseError
                                      ? deviceCount
                                      : undefined}
                                  >
                                    {entitlement?.loading ? (
                                      <p className="mypage-entitlement-message">Checking your devices...</p>
                                    ) : entitlement?.licenseError ? (
                                      <p className="mypage-entitlement-message is-error">{entitlement.licenseError}</p>
                                    ) : entitlement?.licenses.length ? (
                                      <div className="mypage-device-license-list">
                                        {entitlement.licenses.map((license) => {
                                          const deviceMessageId = `${purchase.id}:${license.id}`;
                                          const deviceMessage = deviceMessages[deviceMessageId];
                                          return (
                                            <section
                                              key={license.id}
                                              className="mypage-device-section"
                                              aria-label={`Devices for ${license.productName ?? purchase.product_name}`}
                                            >
                                              <div className="mypage-device-head">
                                                {entitlement.licenses.length > 1 && license.productName ? (
                                                  <h5>{license.productName}</h5>
                                                ) : null}
                                                <p>Devices associated with this license.</p>
                                              </div>

                                              {license.instances.length > 0 ? (
                                                <div className="mypage-device-list">
                                                  {license.instances.map((instance) => {
                                                    const actionId = `${purchase.id}:${license.id}:${instance.identifier}`;
                                                    const isDeactivating = activeDeviceActionId === actionId;
                                                    return (
                                                      <div key={instance.id} className="mypage-device-row">
                                                        <div className="mypage-device-copy">
                                                          <strong>{instance.name}</strong>
                                                          <span>{formatActivatedDate(instance.createdAt)}</span>
                                                          <code title={instance.identifier}>{instance.identifier}</code>
                                                        </div>
                                                        <button
                                                          type="button"
                                                          className="auth-submit auth-submit-secondary mypage-small-button mypage-deactivate-button"
                                                          onClick={() => void handleDeactivateDevice(
                                                            purchase.id,
                                                            license.id,
                                                            instance.identifier,
                                                            instance.name
                                                          )}
                                                          disabled={activeDeviceActionId !== null}
                                                          aria-label={`Deactivate ${instance.name}`}
                                                        >
                                                          {isDeactivating ? 'Deactivating...' : 'Deactivate'}
                                                        </button>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              ) : (
                                                <p className="mypage-entitlement-message">
                                                  No devices are currently associated with this license.
                                                </p>
                                              )}

                                              {deviceMessage ? (
                                                <p className={`mypage-device-message ${deviceMessage.isError ? 'is-error' : 'is-success'}`}>
                                                  {deviceMessage.text}
                                                </p>
                                              ) : null}
                                            </section>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <p className="mypage-entitlement-message">License is being issued.</p>
                                    )}
                                  </MyProductsAccordion>

                                  <MyProductsAccordion
                                    sectionId={`purchase-${purchase.id}-downloads`}
                                    title="Downloads"
                                    count={entitlement && !entitlement.loading && !entitlement.downloadError
                                      ? downloadCount
                                      : undefined}
                                    defaultOpen
                                  >
                                  {entitlement?.loading ? (
                                    <p className="mypage-entitlement-message">Checking available files...</p>
                                  ) : entitlement?.downloadError ? (
                                    <p className="mypage-entitlement-message is-error">{entitlement.downloadError}</p>
                                  ) : downloadCount > 0 ? (
                                    <div className="mypage-download-list">
                                      {isBundle ? (
                                        <>
                                          {installerGroups.length > 0 ? (
                                            <section className="mypage-download-collection">
                                              <h5>Installers</h5>
                                              <div className="mypage-download-collection-body">
                                                {installerGroups.map((downloadGroup) => (
                                                  <section key={downloadGroup.category} className="mypage-download-group is-nested">
                                                    <h6>{downloadGroup.label}</h6>
                                                    {renderDownloadFiles(downloadGroup.files)}
                                                  </section>
                                                ))}
                                              </div>
                                            </section>
                                          ) : null}
                                          {manualGroup ? (
                                            <section className="mypage-download-collection">
                                              <h5>User Manuals</h5>
                                              {renderDownloadFiles(manualGroup.files)}
                                            </section>
                                          ) : null}
                                          {otherGroup ? (
                                            <section className="mypage-download-collection">
                                              <h5>Other Downloads</h5>
                                              {renderDownloadFiles(otherGroup.files)}
                                            </section>
                                          ) : null}
                                        </>
                                      ) : (
                                        categorizedDownloadGroups.map((downloadGroup) => (
                                          <section key={downloadGroup.category} className="mypage-download-group">
                                            <h5>{downloadGroup.label}</h5>
                                            {renderDownloadFiles(downloadGroup.files)}
                                          </section>
                                        ))
                                      )}
                                    </div>
                                  ) : (
                                    <p className="mypage-entitlement-message">Download is not available yet.</p>
                                  )}
                                  </MyProductsAccordion>
                                </div>

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
