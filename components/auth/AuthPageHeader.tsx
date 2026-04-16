import Link from 'next/link';
import AuthNav from '@/components/auth/AuthNav';

export default function AuthPageHeader() {
  return (
    <header className="auth-page-header">
      <Link href="/" className="auth-page-brand">
        FARMVERB
      </Link>
      <AuthNav />
    </header>
  );
}
