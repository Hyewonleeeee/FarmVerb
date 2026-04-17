'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

const MY_PAGE_LOGIN_REDIRECT = '/login?redirect=%2Fmypage';

type DashboardTabKey = 'account' | 'orders' | 'licenses' | 'cart' | 'security';

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

type CartItem = {
  id: string;
  quantity: number;
  created_at: string;
  product: ProductSummary | null;
};

const dashboardTabs: { key: DashboardTabKey; label: string }[] = [
  { key: 'account', label: 'Account Info' },
  { key: 'orders', label: 'Orders / Purchase History' },
  { key: 'licenses', label: 'Licenses' },
  { key: 'cart', label: 'Cart' },
  { key: 'security', label: 'Security' }
];

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

const formatCurrency = (value: number | null, currencyText?: string | null) => {
  if (value === null || Number.isNaN(value)) {
    return '-';
  }

  const normalizedCurrency = (currencyText ?? 'USD').trim().toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', {
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
  const isLoggingOutRef = useRef(false);

  const [activeTab, setActiveTab] = useState<DashboardTabKey>('account');

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [orders, setOrders] = useState<OrderLine[]>([]);
  const [ordersMessage, setOrdersMessage] = useState('');

  const [licenses, setLicenses] = useState<License[]>([]);
  const [licensesMessage, setLicensesMessage] = useState('');

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartMessage, setCartMessage] = useState('');

  const [isAccountEditMode, setIsAccountEditMode] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [countryInput, setCountryInput] = useState('');
  const [accountMessage, setAccountMessage] = useState('');
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  const [downloadMessage, setDownloadMessage] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [copiedLicenseId, setCopiedLicenseId] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [securityMessage, setSecurityMessage] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);

  const emailVerified = Boolean(user?.email_confirmed_at);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
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
        setCountryInput(fallbackProfile.country ?? '');
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
      setCountryInput(loadedProfile.country ?? '');
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
        setOrdersMessage('Could not load purchase history right now.');
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
            product_name: order.product?.name ?? 'Unknown product',
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
            product_name: item.product?.name ?? order.product?.name ?? 'Unknown product',
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
        setOrdersMessage('Detailed item rows are unavailable right now. Showing fallback order data.');
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
        setLicensesMessage('Could not load licenses right now.');
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

    const loadCart = async (currentUser: User) => {
      const { data, error } = await supabase
        .from('cart_items')
        .select('id, quantity, created_at, product:products(id, name, slug)')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (!mounted) {
        return;
      }

      if (error) {
        setCartItems([]);
        setCartMessage('Cart is not available yet. Run the cart migration SQL and refresh.');
        return;
      }

      const normalizedCartItems: CartItem[] = (data ?? []).map((row) => ({
        id: row.id,
        quantity: row.quantity ?? 1,
        created_at: row.created_at,
        product: normalizeProduct(row.product as ProductSummary | ProductSummary[] | null)
      }));

      setCartItems(normalizedCartItems);
      setCartMessage('');
    };

    const loadDashboardData = async (currentUser: User) => {
      await Promise.all([
        loadProfile(currentUser),
        loadOrders(currentUser),
        loadLicenses(currentUser),
        loadCart(currentUser)
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
        setCartItems([]);
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
  }, [router]);

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
    setCountryInput(profile?.country ?? '');
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
    const trimmedCountry = countryInput.trim();

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
    setCountryInput(nextProfile.country ?? '');
    setAccountMessage('Account information updated.');
    setIsAccountEditMode(false);
    setIsSavingAccount(false);
  };

  const refreshCart = async () => {
    if (!user) {
      return;
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('cart_items')
      .select('id, quantity, created_at, product:products(id, name, slug)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      setCartMessage(`Failed to refresh cart: ${error.message}`);
      return;
    }

    const normalized: CartItem[] = (data ?? []).map((row) => ({
      id: row.id,
      quantity: row.quantity ?? 1,
      created_at: row.created_at,
      product: normalizeProduct(row.product as ProductSummary | ProductSummary[] | null)
    }));

    setCartItems(normalized);
    setCartMessage('');
  };

  const handleUpdateCartQuantity = async (cartItemId: string, nextQuantity: number) => {
    if (!user) {
      return;
    }

    const supabase = createBrowserSupabaseClient();

    if (nextQuantity <= 0) {
      const { error } = await supabase.from('cart_items').delete().eq('id', cartItemId).eq('user_id', user.id);
      if (error) {
        setCartMessage(`Failed to update cart: ${error.message}`);
        return;
      }

      await refreshCart();
      return;
    }

    const { error } = await supabase
      .from('cart_items')
      .update({ quantity: nextQuantity })
      .eq('id', cartItemId)
      .eq('user_id', user.id);

    if (error) {
      setCartMessage(`Failed to update cart: ${error.message}`);
      return;
    }

    setCartItems((prev) => prev.map((item) => (item.id === cartItemId ? { ...item, quantity: nextQuantity } : item)));
    setCartMessage('');
  };

  const handleRemoveCartItem = async (cartItemId: string) => {
    if (!user) {
      return;
    }

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.from('cart_items').delete().eq('id', cartItemId).eq('user_id', user.id);

    if (error) {
      setCartMessage(`Failed to remove item: ${error.message}`);
      return;
    }

    setCartItems((prev) => prev.filter((item) => item.id !== cartItemId));
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
    const trimmedPassword = newPassword.trim();

    if (trimmedPassword.length < 6) {
      setSecurityMessage('Password must be at least 6 characters.');
      return;
    }

    setIsChangingPassword(true);
    setSecurityMessage('');

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password: trimmedPassword });

    if (error) {
      setSecurityMessage(error.message);
      setIsChangingPassword(false);
      return;
    }

    setNewPassword('');
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
      setDownloadMessage('Please log in again.');
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

    const payload = (await response.json().catch(() => null)) as { downloadUrl?: string; error?: string } | null;

    if (!response.ok) {
      setDownloadMessage(payload?.error ?? 'Download failed.');
      setIsDownloading(false);
      return;
    }

    if (!payload?.downloadUrl) {
      setDownloadMessage('Download URL not found.');
      setIsDownloading(false);
      return;
    }

    setDownloadMessage('Download starting...');
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
      setDownloadMessage('Could not copy the license key.');
    }
  };

  const accountJoinDate = profile?.created_at ?? user?.created_at ?? null;

  const licenseCards = useMemo(() => {
    return licenses.map((license) => ({
      ...license,
      productName: license.product?.name ?? 'Unknown product',
      productSlug: license.product?.slug ?? null
    }));
  }, [licenses]);

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
              <p className="auth-copy">Manage account, purchases, licenses, cart, and security in one place.</p>
            </div>

            <button type="button" className="auth-submit auth-submit-secondary mypage-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>

          <nav className="mypage-tabs" role="tablist" aria-label="My Page sections">
            {dashboardTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`mypage-tab ${activeTab === tab.key ? 'is-active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <section className="mypage-panel mypage-panel-dashboard" role="tabpanel">
            {activeTab === 'account' ? (
              <>
                <h2>Account Info</h2>

                <form
                  className="auth-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!isAccountEditMode) {
                      return;
                    }
                    void handleSaveProfile();
                  }}
                >
                  <div className="mypage-field-grid">
                    <div>
                      <label className="auth-label" htmlFor="account-user-id">
                        User ID
                      </label>
                      <input
                        id="account-user-id"
                        className="auth-input mypage-readonly"
                        type="text"
                        value={user.id}
                        disabled
                        readOnly
                      />
                    </div>

                    <div>
                      <label className="auth-label" htmlFor="account-join-date">
                        Join Date
                      </label>
                      <input
                        id="account-join-date"
                        className="auth-input mypage-readonly"
                        type="text"
                        value={formatDate(accountJoinDate)}
                        disabled
                        readOnly
                      />
                    </div>
                  </div>

                  <label className="auth-label" htmlFor="account-name">
                    Name
                  </label>
                  <input
                    id="account-name"
                    className={`auth-input ${!isAccountEditMode ? 'mypage-readonly' : ''}`}
                    type="text"
                    autoComplete="name"
                    value={nameInput}
                    onChange={(event) => setNameInput(event.target.value)}
                    disabled={!isAccountEditMode || isSavingAccount}
                  />

                  <label className="auth-label" htmlFor="account-email">
                    Email
                  </label>
                  <input
                    id="account-email"
                    className="auth-input mypage-readonly"
                    type="email"
                    autoComplete="email"
                    value={profile?.email || user.email || '-'}
                    disabled
                    readOnly
                  />

                  <label className="auth-label" htmlFor="account-country">
                    Country
                  </label>
                  <input
                    id="account-country"
                    className={`auth-input ${!isAccountEditMode ? 'mypage-readonly' : ''}`}
                    type="text"
                    autoComplete="country-name"
                    value={countryInput}
                    onChange={(event) => setCountryInput(event.target.value)}
                    disabled={!isAccountEditMode || isSavingAccount}
                    placeholder="South Korea"
                  />

                  {!isAccountEditMode ? (
                    <button type="button" className="auth-submit" onClick={handleStartEdit}>
                      Edit
                    </button>
                  ) : (
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
                  )}
                </form>

                {accountMessage ? <p className="auth-message">{accountMessage}</p> : null}
              </>
            ) : null}

            {activeTab === 'orders' ? (
              <>
                <h2>Orders / Purchase History</h2>

                {ordersMessage ? <p>{ordersMessage}</p> : null}

                {!ordersMessage && orders.length === 0 ? (
                  <p>No purchases yet. Your purchased products will appear here after checkout.</p>
                ) : null}

                {orders.length > 0 ? (
                  <ul className="mypage-list">
                    {orders.map((order) => (
                      <li key={order.id} className="mypage-list-item">
                        <div className="mypage-item-head">{order.product_name}</div>
                        <div className="mypage-meta-row">✔ Purchased • {formatDate(order.purchased_at)}</div>
                        <div className="mypage-meta-row">
                          Qty {order.quantity} • {formatCurrency(order.unit_price, order.currency)}
                        </div>
                        <div className="mypage-meta-row">Status: {normalizePaymentStatus(order.payment_status)}</div>
                        <div className="mypage-meta-row">Currency: {(order.currency ?? 'USD').toUpperCase()}</div>
                        <div className="mypage-meta-row">Order: {order.order_number ?? order.order_id}</div>
                        <div className="mypage-meta-row">TX: {order.transaction_id ?? '-'}</div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}

            {activeTab === 'licenses' ? (
              <>
                <h2>Licenses</h2>

                {licensesMessage ? <p>{licensesMessage}</p> : null}

                {!licensesMessage && licenseCards.length === 0 ? <p>No licenses yet.</p> : null}

                {licenseCards.length > 0 ? (
                  <ul className="mypage-list">
                    {licenseCards.map((license) => (
                      <li key={license.id} className="mypage-list-item">
                        <div className="mypage-item-head">{license.productName}</div>
                        <div className="mypage-meta-row">✔ Purchased • {formatDate(license.created_at)}</div>

                        <div className="mypage-license-row">
                          <span className="mypage-meta-label">License</span>
                          <code className="mypage-license-key">{license.license_key}</code>
                          <button
                            type="button"
                            className="auth-submit auth-submit-secondary mypage-small-button"
                            onClick={() => void handleCopyLicense(license.id, license.license_key)}
                          >
                            {copiedLicenseId === license.id ? 'Copied' : 'Copy'}
                          </button>
                        </div>

                        {license.productSlug ? (
                          <button
                            type="button"
                            className="auth-submit mypage-small-button"
                            onClick={() => void handleDownload(license.productSlug as string)}
                            disabled={isDownloading}
                          >
                            {isDownloading ? 'Preparing...' : 'Download'}
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {downloadMessage ? <p className="mypage-inline-message">{downloadMessage}</p> : null}
              </>
            ) : null}

            {activeTab === 'cart' ? (
              <>
                <h2>Cart</h2>

                {cartMessage ? <p>{cartMessage}</p> : null}

                {!cartMessage && cartItems.length === 0 ? (
                  <p>Your cart is empty. Added items will appear here.</p>
                ) : null}

                {cartItems.length > 0 ? (
                  <ul className="mypage-list">
                    {cartItems.map((item) => (
                      <li key={item.id} className="mypage-list-item mypage-cart-item">
                        <div>
                          <div className="mypage-item-head">{item.product?.name ?? 'Unknown product'}</div>
                          <div className="mypage-meta-row">Added • {formatDate(item.created_at)}</div>
                        </div>

                        <div className="mypage-cart-actions">
                          <button
                            type="button"
                            className="auth-submit auth-submit-secondary mypage-qty-button"
                            onClick={() => void handleUpdateCartQuantity(item.id, item.quantity - 1)}
                          >
                            -
                          </button>
                          <span className="mypage-qty-label">Qty {item.quantity}</span>
                          <button
                            type="button"
                            className="auth-submit auth-submit-secondary mypage-qty-button"
                            onClick={() => void handleUpdateCartQuantity(item.id, item.quantity + 1)}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="auth-submit auth-submit-secondary mypage-small-button"
                            onClick={() => void handleRemoveCartItem(item.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}

            {activeTab === 'security' ? (
              <>
                <h2>Security</h2>

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

                  <div className="mypage-form-actions">
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

                {securityMessage ? <p className="auth-message">{securityMessage}</p> : null}
              </>
            ) : null}
          </section>
        </section>
      </main>
    </div>
  );
}
