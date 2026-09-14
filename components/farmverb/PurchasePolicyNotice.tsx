import Link from 'next/link';

export default function PurchasePolicyNotice() {
  return (
    <p className="purchase-policy-notice">
      Before purchasing, please review our <Link href="/refund-policy">Refund Policy</Link>.
    </p>
  );
}
