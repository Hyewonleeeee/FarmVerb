import { notFound } from 'next/navigation';
import FarmVerbSite from '@/components/farmverb/FarmVerbSite';
import { PRODUCT_PUBLIC_ROUTE_SEGMENTS } from '@/lib/ui/farmVerbRoutes';

const VALID_ROUTES = new Set([
  'instrument',
  'plugins',
  'sample-pack',
  'support',
  ...PRODUCT_PUBLIC_ROUTE_SEGMENTS
]);

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
