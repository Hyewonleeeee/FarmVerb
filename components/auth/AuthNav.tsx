'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export default function AuthNav() {
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) {
        return;
      }
      setUser(data.user ?? null);
      setIsReady(true);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    const supabase = createBrowserSupabaseClient();
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.assign('/');
    }
  };

  if (!isReady) {
    return <div className="auth-nav auth-nav-loading" aria-hidden="true" />;
  }

  if (!user) {
    return (
      <div className="auth-nav" aria-label="Authentication links">
        <Link href="/login" className="auth-nav-link">
          Login
        </Link>
        <Link href="/signup" className="auth-nav-link auth-nav-signup">
          Sign Up
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-nav" aria-label="Authenticated actions">
      <Link href="/mypage" className="auth-nav-link">
        My Page
      </Link>
      <button type="button" className="auth-nav-link auth-nav-button" onClick={handleLogout}>
        Logout
      </button>
    </div>
  );
}
