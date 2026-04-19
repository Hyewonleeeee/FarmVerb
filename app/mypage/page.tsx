'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import CountrySelect, { DEFAULT_COUNTRY_NAME, normalizeCountryName } from '@/components/ui/CountrySelect';
import { getPaymentCopy, type PaymentApiErrorCode, type PaymentLocale } from '@/lib/i18n/payment';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

const MY_PAGE_LOGIN_REDIRECT = '/login?redirect=%2Fmypage';

type DashboardTabKey = 'account' | 'orders' | 'licenses' | 'security';

type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  country: string | null;
  created_at: string | null;
};

type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  price?: number | null;
  currency?: string | null;
};

type OrderRow = {
  id: string;
  created_at: string;
  order_number: string | null;
  payment_status: string | null;
  currency: string | null;
  transaction_id: string | null;
  product: ProductSummary | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  quantity: number | null;
  unit_price: number | null;
  currency: string | null;
  product: ProductSummary | null;
};

type OrderLine = {
  id: string;
  order_id: string;
  purchased_at: string;
  order_number: string | null;
  payment_status: string | null;
  currency: string | null;
  transaction_id: string | null;
  product_name: string;
  product_slug: string | null;
  quantity: number;
  unit_price: number | null;
};

type License = {
  id: string;
  license_key: string;
  created_at: string;
  product: ProductSummary | null;
};

const dashboardTabs: { key: DashboardTabKey; label: string }[] = [
  { key: 'account', label: 'Account Info' },
  { key: 'orders', label: 'Orders / Purchase History' },
  { key: 'licenses', label: 'Licenses' },
  { key: 'security', label: 'Security' }
];

const dashboardSectionCopy: Record<DashboardTabKey, string> = {
  account: 'Personal details and account profile settings.',
  orders: 'Purchase records with payment and order metadata.',
  licenses: 'License keys, copy tools, and secure download actions.',
  security: 'Verification and password management for account safety.'
};

const normalizeProduct = (product: ProductSummary | ProductSummary[] | null): ProductSummary | null => {
  if (!product) {
    return null;
  }

  if (Array.isArray(product)) {
    return product[0] ?? null;
  }

  return product;
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

  const [licenses, setLicenses] = useState<License[]>([]);
  const [licensesMessage, setLicensesMessage] = useState('');

  const [isAccountEditMode, setIsAccountEditMode] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [countryInput, setCountryInput] = useState(DEFAULT_COUNTRY_NAME);
  const [accountMessage, setAccountMessage] = useState('');
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  const [downloadMessage, setDownloadMessage] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [copiedLicenseId, setCopiedLicenseId] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [securityMessage, setSecurityMessage] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);

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
          country: metadata.country ?? DEFAULT_COUNTRY_NAME,
          created_at: currentUser.created_at ?? null
        };

        setProfile(fallbackProfile);
        setNameInput(fallbackProfile.name ?? '');
        setCountryInput(normalizeCountryName(fallbackProfile.country));
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
      setCountryInput(normalizeCountryName(loadedProfile.country));
    };

    const loadOrders = async (currentUser: User) => {
      const { data: orderRows, error: ordersError } = await supabase
        .from('orders')
        .select('id, created_at, order_number, payment_status, currency, transaction_id, product:products(id, name, slug)')
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

      const normalizedOrders: OrderRow[] = (orderRows ?? []).map((row) => ({
        id: row.id,
        created_at: row.created_at,
        order_number: row.order_number,
        payment_status: row.payment_status,
        currency: row.currency,
        transaction_id: row.transaction_id,
        product: normalizeProduct(row.product as ProductSummary | ProductSummary[] | null)
      }));

      if (normalizedOrders.length === 0) {
        setOrders([]);
        setOrdersMessage('');
        return;
      }

      const orderIds = normalizedOrders.map((order) => order.id);

      const { data: itemRows, error: itemsError } = await supabase
        .from('order_items')
        .select('id, order_id, quantity, unit_price, currency, product:products(id, name, slug)')
        .in('order_id', orderIds);

      const normalizedItems: OrderItemRow[] = (itemRows ?? []).map((row) => ({
        id: row.id,
        order_id: row.order_id,
        quantity: row.quantity,
        unit_price: row.unit_price,
        currency: row.currency,
        product: normalizeProduct(row.product as ProductSummary | ProductSummary[] | null)
      }));

      const itemsByOrder = new Map<string, OrderItemRow[]>();
      normalizedItems.forEach((item) => {
        const list = itemsByOrder.get(item.order_id) ?? [];
        list.push(item);
        itemsByOrder.set(item.order_id, list);
      });

      const builtOrderLines: OrderLine[] = [];

      normalizedOrders.forEach((order) => {
        const linkedItems = itemsByOrder.get(order.id) ?? [];

        if (linkedItems.length === 0) {
          builtOrderLines.push({
            id: `${order.id}-fallback`,
            order_id: order.id,
            purchased_at: order.created_at,
            order_number: order.order_number,
            payment_status: order.payment_status,
            currency: order.currency,
            transaction_id: order.transaction_id,
            product_name: order.product?.name ?? uiText.orders.unknownProduct,
            product_slug: order.product?.slug ?? null,
            quantity: 1,
            unit_price: null
          });
          return;
        }

        linkedItems.forEach((item) => {
          builtOrderLines.push({
            id: item.id,
            order_id: order.id,
            purchased_at: order.created_at,
            order_number: order.order_number,
            payment_status: order.payment_status,
            currency: item.currency ?? order.currency,
            transaction_id: order.transaction_id,
            product_name: item.product?.name ?? order.product?.name ?? uiText.orders.unknownProduct,
            product_slug: item.product?.slug ?? order.product?.slug ?? null,
            quantity: item.quantity ?? 1,
            unit_price: item.unit_price
          });
        });
      });

      setOrders(
        builtOrderLines.sort((a, b) => {
          const timeA = new Date(a.purchased_at).getTime();
          const timeB = new Date(b.purchased_at).getTime();
          return timeB - timeA;
        })
      );

      if (itemsError) {
        setOrdersMessage(uiText.orders.detailsPartial);
        return;
      }

      setOrdersMessage('');
    };

    const loadLicenses = async (currentUser: User) => {
      const { data, error } = await supabase
        .from('licenses')
        .select('id, license_key, created_at, product:products(id, name, slug)')
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
        license_key: row.license_key,
        created_at: row.created_at,
        product: normalizeProduct(row.product as ProductSummary | ProductSummary[] | null)
      }));

      setLicenses(normalizedLicenses);
      setLicensesMessage('');
    };

    const loadDashboardData = async (currentUser: User) => {
      await Promise.all([loadProfile(currentUser), loadOrders(currentUser), loadLicenses(currentUser)]);

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
      await loadDashboardData(session.user);
    };

    void checkSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
        setProfile(null);
        setOrders([]);
        setLicenses([]);
        setIsAccountEditMode(false);
        router.replace(isLoggingOutRef.current ? '/' : MY_PAGE_LOGIN_REDIRECT);
        return;
      }

      isLoggingOutRef.current = false;
      setUser(session.user);
      void loadDashboardData(session.user);
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
    setIsAccountEditMode(true);
  };

  const handleCancelEdit = () => {
    setNameInput(profile?.name ?? '');
    setCountryInput(normalizeCountryName(profile?.country));
    setAccountMessage('');
    setIsAccountEditMode(false);
  };

  const handleSaveProfile = async () => {
    if (!user) {
      return;
    }

    setIsSavingAccount(true);
    setAccountMessage('');

    const supabase = createBrowserSupabaseClient();
    const trimmedName = nameInput.trim();
    const trimmedCountry = normalizeCountryName(countryInput).trim();

    const nextProfile = {
      id: user.id,
      email: user.email ?? '',
      name: trimmedName || null,
      country: trimmedCountry || null
    };

    const { error } = await supabase.from('profiles').upsert(nextProfile, { onConflict: 'id' });

    if (error) {
      setAccountMessage(`Failed to save profile: ${error.message}`);
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
    setCountryInput(nextProfile.country ?? DEFAULT_COUNTRY_NAME);
    setAccountMessage('Account information updated.');
    setIsAccountEditMode(false);
    setIsSavingAccount(false);
  };

  const handleSendResetEmail = async () => {
    if (!user?.email) {
      setSecurityMessage('Email address not found for this account.');
      return;
    }

    setIsSendingResetEmail(true);
    setSecurityMessage('');

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(user.email);

    if (error) {
      setSecurityMessage(error.message);
      setIsSendingResetEmail(false);
      return;
    }

    setSecurityMessage('Password reset email sent. Please check your inbox.');
    setIsSendingResetEmail(false);
  };

  const handleChangePassword = async () => {
    if (!user?.email) {
      setSecurityMessage('Email address not found for this account.');
      return;
    }

    const currentPasswordValue = currentPassword.trim();
    const newPasswordValue = newPassword.trim();
    const confirmPasswordValue = confirmNewPassword.trim();

    if (!currentPasswordValue) {
      setSecurityMessage('Please enter your current password.');
      return;
    }

    if (newPasswordValue.length < 6) {
      setSecurityMessage('New password must be at least 6 characters.');
      return;
    }

    if (newPasswordValue !== confirmPasswordValue) {
      setSecurityMessage('New password and confirmation do not match.');
      return;
    }

    if (currentPasswordValue === newPasswordValue) {
      setSecurityMessage('New password must be different from your current password.');
      return;
    }

    setIsChangingPassword(true);
    setSecurityMessage('');

    const supabase = createBrowserSupabaseClient();
    const { data: verifyData, error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPasswordValue
    });

    if (verifyError || !verifyData.user || verifyData.user.id !== user.id) {
      setSecurityMessage('Current password is incorrect.');
      setIsChangingPassword(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPasswordValue });

    if (error) {
      setSecurityMessage(error.message);
      setIsChangingPassword(false);
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setSecurityMessage('Password updated successfully.');
    setIsChangingPassword(false);
  };

  const handleResendVerification = async () => {
    if (!user?.email) {
      setSecurityMessage('Email address not found for this account.');
      return;
    }

    setIsResendingVerification(true);
    setSecurityMessage('');

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: user.email
    });

    if (error) {
      setSecurityMessage(error.message);
      setIsResendingVerification(false);
      return;
    }

    setSecurityMessage('Verification email sent again. Please check your inbox.');
    setIsResendingVerification(false);
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

  const licenseCards = useMemo(() => {
    return licenses.map((license) => ({
      ...license,
      productName: license.product?.name ?? paymentCopy.orders.unknownProduct,
      productSlug: license.product?.slug ?? null
    }));
  }, [licenses, paymentCopy.orders.unknownProduct]);

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

                  {accountMessage ? <p className="auth-message">{accountMessage}</p> : null}
                </>
              ) : null}

              {activeTab === 'orders' ? (
                <>
                  {ordersMessage ? <p>{ordersMessage}</p> : null}

                  {!ordersMessage && orders.length === 0 ? (
                    <p>{paymentCopy.orders.empty}</p>
                  ) : null}

                  {orders.length > 0 ? (
                    <ul className="mypage-list">
                      {orders.map((order) => (
                        <li key={order.id} className="mypage-list-item">
                          <div className="mypage-item-head">{order.product_name}</div>
                          <div className="mypage-meta-row">
                            ✔ {paymentCopy.orders.purchased} • {formatDate(order.purchased_at)}
                          </div>
                          <div className="mypage-meta-row">
                            {paymentCopy.orders.qty} {order.quantity} •{' '}
                            {formatCurrency(order.unit_price, order.currency, paymentLocale)}
                          </div>
                          <div className="mypage-meta-row">
                            {paymentCopy.orders.status}: {normalizePaymentStatus(order.payment_status)}
                          </div>
                          <div className="mypage-meta-row">
                            {paymentCopy.orders.currency}: {(order.currency ?? 'USD').toUpperCase()}
                          </div>
                          <div className="mypage-meta-row">
                            {paymentCopy.orders.orderNumber}: {order.order_number ?? order.order_id}
                          </div>
                          <div className="mypage-meta-row">
                            {paymentCopy.orders.transactionId}: {order.transaction_id ?? '-'}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : null}

              {activeTab === 'licenses' ? (
                <>
                  {licensesMessage ? <p>{licensesMessage}</p> : null}

                  {!licensesMessage && licenseCards.length === 0 ? <p>{paymentCopy.licenses.empty}</p> : null}

                  {licenseCards.length > 0 ? (
                    <ul className="mypage-list">
                      {licenseCards.map((license) => (
                        <li key={license.id} className="mypage-list-item">
                          <div className="mypage-item-head">{license.productName}</div>
                          <div className="mypage-meta-row">
                            ✔ {paymentCopy.orders.purchased} • {formatDate(license.created_at)}
                          </div>

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

                          {license.productSlug ? (
                            <button
                              type="button"
                              className="auth-submit mypage-small-button"
                              onClick={() => void handleDownload(license.productSlug as string)}
                              disabled={isDownloading}
                            >
                              {isDownloading ? paymentCopy.licenses.preparing : paymentCopy.licenses.download}
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
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

                      {!emailVerified ? (
                        <button
                          type="button"
                          className="auth-submit auth-submit-secondary mypage-small-button"
                          onClick={() => void handleResendVerification()}
                          disabled={isResendingVerification}
                        >
                          {isResendingVerification ? 'Sending...' : 'Send Verification Email Again'}
                        </button>
                      ) : null}
                    </div>

                    <div className="mypage-security-block">
                      <div className="mypage-item-head">Change Password</div>

                      <div className="mypage-security-fields">
                        <div className="mypage-security-field">
                          <label className="auth-label" htmlFor="current-password-input">
                            Current Password
                          </label>
                          <input
                            id="current-password-input"
                            className="auth-input"
                            type="password"
                            autoComplete="current-password"
                            value={currentPassword}
                            onChange={(event) => setCurrentPassword(event.target.value)}
                            placeholder="Enter current password"
                          />
                        </div>

                        <div className="mypage-security-field">
                          <label className="auth-label" htmlFor="new-password-input">
                            New Password
                          </label>
                          <input
                            id="new-password-input"
                            className="auth-input"
                            type="password"
                            autoComplete="new-password"
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            minLength={6}
                            placeholder="At least 6 characters"
                          />
                        </div>

                        <div className="mypage-security-field">
                          <label className="auth-label" htmlFor="confirm-new-password-input">
                            Confirm New Password
                          </label>
                          <input
                            id="confirm-new-password-input"
                            className="auth-input"
                            type="password"
                            autoComplete="new-password"
                            value={confirmNewPassword}
                            onChange={(event) => setConfirmNewPassword(event.target.value)}
                            minLength={6}
                            placeholder="Re-enter new password"
                          />
                        </div>
                      </div>

                      <div className="mypage-form-actions mypage-security-actions">
                        <button
                          type="button"
                          className="auth-submit"
                          onClick={() => void handleChangePassword()}
                          disabled={isChangingPassword}
                        >
                          {isChangingPassword ? 'Updating...' : 'Change Password'}
                        </button>

                        <button
                          type="button"
                          className="auth-submit auth-submit-secondary"
                          onClick={() => void handleSendResetEmail()}
                          disabled={isSendingResetEmail}
                        >
                          {isSendingResetEmail ? 'Sending...' : 'Send Reset Password Email'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {securityMessage ? <p className="auth-message">{securityMessage}</p> : null}
                </>
              ) : null}
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
