import { notFound } from 'next/navigation';
import FarmVerbSite from '@/components/farmverb/FarmVerbSite';

const VALID_ROUTES = new Set(['instrument', 'plugins', 'sample-pack', 'support']);

export default async function FarmVerbRoutePage({
  params
}: Readonly<{
  params: Promise<{ route: string }>;
}>) {
  const { route } = await params;

  if (!VALID_ROUTES.has(route)) {
    notFound();
  }

  return <FarmVerbSite />;
}
