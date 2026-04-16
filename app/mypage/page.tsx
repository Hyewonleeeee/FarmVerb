'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

const MY_PAGE_LOGIN_REDIRECT = '/login?redirect=%2Fmypage';

const infoSections = [
  {
    title: 'License Management',
    description: 'License keys, activations, and machine status can be managed here.'
  },
  {
    title: 'Downloads',
    description: 'Installers and updates will be available in this section.'
  }
];

type Profile = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

type ProductSummary = {
  id: string;
  name: string;
  slug: string;
};

type Order = {
  id: string;
  created_at: string;
  product: ProductSummary | null;
};

type License = {
  id: string;
  license_key: string;
  created_at: string;
  product: ProductSummary | null;
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

export default function MyPage() {
  const router = useRouter();
  const isLoggingOutRef = useRef(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersMessage, setOrdersMessage] = useState('');
  const [licenses, setLicenses] = useState<License[]>([]);
  const [licensesMessage, setLicensesMessage] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [copiedLicenseId, setCopiedLicenseId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let mounted = true;

    const loadProfile = async (currentUser: User) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('name, email, phone')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (!mounted) {
        return;
      }

      if (error || !data) {
        const fallbackProfile = {
          name: null,
          email: currentUser.email ?? null,
          phone: null
        };

        setProfile(fallbackProfile);
        setNameInput(fallbackProfile.name ?? '');
        setPhoneInput(fallbackProfile.phone ?? '');
        return;
      }

      const loadedProfile = {
        name: data.name,
        email: data.email ?? currentUser.email ?? null,
        phone: data.phone
      };

      setProfile(loadedProfile);
      setNameInput(loadedProfile.name ?? '');
      setPhoneInput(loadedProfile.phone ?? '');
    };

    const loadOrders = async (currentUser: User) => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, created_at, product:products(id, name, slug)')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (!mounted) {
        return;
      }

      if (error) {
        setOrders([]);
        setOrdersMessage('Could not load purchase history right now.');
        return;
      }

      const normalizedOrders: Order[] = (data ?? []).map((row) => ({
        id: row.id,
        created_at: row.created_at,
        product: normalizeProduct(row.product as ProductSummary | ProductSummary[] | null)
      }));

      setOrders(normalizedOrders);
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
      await loadProfile(session.user);
      await loadOrders(session.user);
      await loadLicenses(session.user);
      setIsLoading(false);
    };

    void checkSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
        setProfile(null);
        setOrders([]);
        setOrdersMessage('');
        setLicenses([]);
        setLicensesMessage('');
        setIsEditMode(false);
        router.replace(isLoggingOutRef.current ? '/' : MY_PAGE_LOGIN_REDIRECT);
        return;
      }

      isLoggingOutRef.current = false;
      setUser(session.user);
      void (async () => {
        await loadProfile(session.user);
        await loadOrders(session.user);
        await loadLicenses(session.user);
        setIsLoading(false);
      })();
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
    setSaveMessage('');
    setIsEditMode(true);
  };

  const handleCancelEdit = () => {
    setNameInput(profile?.name ?? '');
    setPhoneInput(profile?.phone ?? '');
    setSaveMessage('');
    setIsEditMode(false);
  };

  const handleSaveProfile = async () => {
    if (!user) {
      return;
    }

    setIsSaving(true);
    setSaveMessage('');

    const supabase = createBrowserSupabaseClient();
    const trimmedName = nameInput.trim();
    const trimmedPhone = phoneInput.trim();

    const nextProfile = {
      id: user.id,
      email: user.email ?? '',
      name: trimmedName || null,
      phone: trimmedPhone || null
    };

    const { error } = await supabase.from('profiles').upsert(nextProfile, { onConflict: 'id' });

    if (error) {
      setSaveMessage(`Failed to save profile: ${error.message}`);
      setIsSaving(false);
      return;
    }

    setProfile({
      name: nextProfile.name,
      email: nextProfile.email || null,
      phone: nextProfile.phone
    });
    setNameInput(nextProfile.name ?? '');
    setPhoneInput(nextProfile.phone ?? '');
    setSaveMessage('Profile updated successfully.');
    setIsEditMode(false);
    setIsSaving(false);
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

    const targetProductSlug = productSlug;

    const response = await fetch('/api/download', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ slug: targetProductSlug })
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

  const formatOrderDate = (dateText: string) => {
    const date = new Date(dateText);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}.${mm}.${dd}`;
  };

  const getProductSlug = (order: Order) => {
    if (order.product?.slug) {
      return order.product.slug;
    }

    return null;
  };

  const findLicenseForProduct = (order: Order) => {
    const productId = order.product?.id;
    if (productId) {
      const byId = licenses.find((license) => license.product?.id === productId);
      if (byId) {
        return byId;
      }
    }

    const productName = order.product?.name ?? '';
    const normalizedName = productName.toLowerCase();
    if (!normalizedName) {
      return null;
    }

    return licenses.find((license) => {
      const normalizedLicenseName = (license.product?.name ?? '').toLowerCase();
      return normalizedLicenseName === normalizedName;
    });
  };

  return (
    <div className="auth-page-shell">
      <AuthPageHeader />

      <main className="auth-page-main">
        <section className="mypage-card">
          <p className="auth-overline">My Account</p>
          <h1 className="auth-title">My Page</h1>

          <p className="auth-copy">Email: {profile?.email || user.email || '-'}</p>

          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!isEditMode) {
                return;
              }
              void handleSaveProfile();
            }}
          >
            <label className="auth-label" htmlFor="mypage-name">
              Name
            </label>
            <input
              id="mypage-name"
              className="auth-input"
              type="text"
              autoComplete="name"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              disabled={!isEditMode || isSaving}
              style={
                !isEditMode
                  ? {
                      backgroundColor: 'rgba(236, 239, 228, 0.95)',
                      color: 'rgba(76, 90, 64, 0.9)',
                      cursor: 'not-allowed'
                    }
                  : undefined
              }
            />

            <label className="auth-label" htmlFor="mypage-phone">
              Phone
            </label>
            <input
              id="mypage-phone"
              className="auth-input"
              type="tel"
              autoComplete="tel"
              value={phoneInput}
              onChange={(event) => setPhoneInput(event.target.value)}
              disabled={!isEditMode || isSaving}
              style={
                !isEditMode
                  ? {
                      backgroundColor: 'rgba(236, 239, 228, 0.95)',
                      color: 'rgba(76, 90, 64, 0.9)',
                      cursor: 'not-allowed'
                    }
                  : undefined
              }
            />

            {!isEditMode ? (
              <button type="button" className="auth-submit" onClick={handleStartEdit}>
                Edit
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '0.55rem', marginTop: '0.7rem' }}>
                <button
                  type="button"
                  className="auth-submit auth-submit-secondary"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button type="submit" className="auth-submit" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </form>

          {saveMessage ? <p className="auth-message">{saveMessage}</p> : null}

          <button type="button" className="auth-submit auth-submit-secondary" onClick={handleLogout}>
            Logout
          </button>
        </section>

        <section className="mypage-grid" aria-label="Upcoming dashboard sections">
          <article className="mypage-panel">
            <h2>Purchase History</h2>

            {ordersMessage ? <p>{ordersMessage}</p> : null}
            {licensesMessage ? <p>{licensesMessage}</p> : null}

            {!ordersMessage && orders.length === 0 ? (
              <p>No purchases yet. Your purchased products will appear here after checkout.</p>
            ) : null}

            {!ordersMessage && orders.length > 0 ? (
              <ul style={{ margin: '0.55rem 0 0', paddingLeft: '1rem' }}>
                {orders.map((order) => {
                  const license = findLicenseForProduct(order);
                  const productSlug = getProductSlug(order);
                  const productName = order.product?.name ?? 'Unknown product';

                  return (
                    <li key={order.id} style={{ marginBottom: '0.9rem' }}>
                      <div>{productName}</div>
                      <div style={{ opacity: 0.78, fontSize: '0.84rem', marginTop: '0.12rem' }}>
                        ✔ Purchased • {formatOrderDate(order.created_at)}
                      </div>

                      <div
                        style={{
                          marginTop: '0.45rem',
                          display: 'flex',
                          gap: '0.45rem',
                          alignItems: 'center',
                          flexWrap: 'wrap'
                        }}
                      >
                        <span style={{ fontSize: '0.8rem', opacity: 0.82 }}>License:</span>
                        <code
                          style={{
                            fontSize: '0.78rem',
                            padding: '0.2rem 0.38rem',
                            borderRadius: '6px',
                            background: 'rgba(227, 239, 185, 0.72)',
                            border: '1px solid rgba(152, 183, 85, 0.32)'
                          }}
                        >
                          {license?.license_key ?? 'Not issued yet'}
                        </code>

                        {license ? (
                          <button
                            type="button"
                            className="auth-submit auth-submit-secondary"
                            style={{ marginTop: 0, padding: '0.42rem 0.65rem', fontSize: '0.68rem' }}
                            onClick={() => void handleCopyLicense(license.id, license.license_key)}
                          >
                            {copiedLicenseId === license.id ? 'Copied' : 'Copy'}
                          </button>
                        ) : null}
                      </div>

                      {productSlug ? (
                        <button
                          type="button"
                          className="auth-submit"
                          style={{ marginTop: '0.45rem' }}
                          onClick={() => void handleDownload(productSlug)}
                          disabled={isDownloading}
                        >
                          {isDownloading ? 'Preparing...' : 'Download'}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {downloadMessage ? <p style={{ marginTop: '0.55rem' }}>{downloadMessage}</p> : null}
          </article>

          {infoSections.map((section) => (
            <article className="mypage-panel" key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
