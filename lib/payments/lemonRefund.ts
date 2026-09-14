export type VerifiedRefundKind = 'full' | 'partial';

type JsonApiResource<TAttributes> = {
  type: string;
  id: string;
  attributes: TAttributes;
};

type JsonApiSingle<TAttributes> = {
  data: JsonApiResource<TAttributes>;
};

type JsonApiList<TAttributes> = {
  data: Array<JsonApiResource<TAttributes>>;
};

type RefundOrderAttributes = {
  store_id?: number | string;
  status?: string;
  refunded?: boolean;
  refunded_amount?: number;
  total?: number;
  test_mode?: boolean;
};

type RefundLicenseAttributes = {
  order_id?: number | string;
  status?: string;
  disabled?: boolean;
};

type RefundDependencies = {
  getOrder: (orderId: string) => Promise<JsonApiSingle<RefundOrderAttributes>>;
  recordVerifiedRefund: (kind: VerifiedRefundKind) => Promise<void>;
  listLicenseKeys: (orderId: string) => Promise<JsonApiList<RefundLicenseAttributes>>;
  disableLicenseKey: (
    licenseId: string
  ) => Promise<JsonApiSingle<RefundLicenseAttributes>>;
};

export type ProcessVerifiedRefundOptions = {
  orderId: string;
  expectedTestMode: boolean;
  configuredStoreId?: string;
};

export type ProcessVerifiedRefundResult = {
  kind: VerifiedRefundKind;
  licenseCount: number;
  disabledCount: number;
  alreadyDisabledCount: number;
};

export class LemonRefundVerificationError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'LemonRefundVerificationError';
    this.code = code;
  }
}

function toStringId(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

function getVerifiedRefundKind(attributes: RefundOrderAttributes): VerifiedRefundKind {
  const status = attributes.status?.trim().toLowerCase();

  if (status === 'refunded' && attributes.refunded === true) {
    if (
      typeof attributes.refunded_amount === 'number'
      && Number.isFinite(attributes.refunded_amount)
      && typeof attributes.total === 'number'
      && Number.isFinite(attributes.total)
      && attributes.refunded_amount < attributes.total
    ) {
      throw new LemonRefundVerificationError(
        'The Lemon Squeezy order reports inconsistent full-refund amounts.',
        'REFUND_AMOUNT_MISMATCH'
      );
    }

    return 'full';
  }

  if (status === 'partial_refund' && attributes.refunded !== true) {
    return 'partial';
  }

  throw new LemonRefundVerificationError(
    'The Lemon Squeezy order is not in a verified refunded state.',
    'REFUND_NOT_VERIFIED'
  );
}

function isDisabledLicense(attributes: RefundLicenseAttributes) {
  return attributes.disabled === true || attributes.status?.trim().toLowerCase() === 'disabled';
}

export async function processVerifiedRefund(
  options: ProcessVerifiedRefundOptions,
  dependencies: RefundDependencies
): Promise<ProcessVerifiedRefundResult> {
  const orderResponse = await dependencies.getOrder(options.orderId);
  const order = orderResponse.data;

  if (order.type !== 'orders' || order.id !== options.orderId) {
    throw new LemonRefundVerificationError(
      'The Lemon Squeezy order response did not match the refunded order.',
      'REFUND_ORDER_MISMATCH'
    );
  }

  if (Boolean(order.attributes.test_mode) !== options.expectedTestMode) {
    throw new LemonRefundVerificationError(
      'The Lemon Squeezy refund environment did not match the webhook.',
      'REFUND_MODE_MISMATCH'
    );
  }

  if (
    options.configuredStoreId
    && toStringId(order.attributes.store_id) !== options.configuredStoreId
  ) {
    throw new LemonRefundVerificationError(
      'The refunded order did not belong to the configured Lemon Squeezy store.',
      'REFUND_STORE_MISMATCH'
    );
  }

  const kind = getVerifiedRefundKind(order.attributes);
  await dependencies.recordVerifiedRefund(kind);

  if (kind === 'partial') {
    return {
      kind,
      licenseCount: 0,
      disabledCount: 0,
      alreadyDisabledCount: 0
    };
  }

  const licenseResponse = await dependencies.listLicenseKeys(options.orderId);
  const licenses = licenseResponse.data.filter(
    (license) => license.type === 'license-keys'
      && toStringId(license.attributes.order_id) === options.orderId
  );

  let disabledCount = 0;
  let alreadyDisabledCount = 0;

  for (const license of licenses) {
    if (isDisabledLicense(license.attributes)) {
      alreadyDisabledCount += 1;
      continue;
    }

    const updatedResponse = await dependencies.disableLicenseKey(license.id);
    const updatedLicense = updatedResponse.data;
    if (
      updatedLicense.type !== 'license-keys'
      || updatedLicense.id !== license.id
      || !isDisabledLicense(updatedLicense.attributes)
    ) {
      throw new LemonRefundVerificationError(
        'Lemon Squeezy did not confirm that a refunded license was disabled.',
        'LICENSE_DISABLE_NOT_CONFIRMED'
      );
    }

    disabledCount += 1;
  }

  return {
    kind,
    licenseCount: licenses.length,
    disabledCount,
    alreadyDisabledCount
  };
}
