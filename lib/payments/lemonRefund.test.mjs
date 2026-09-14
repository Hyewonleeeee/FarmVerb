import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LemonRefundVerificationError,
  processVerifiedRefund
} from './lemonRefund.ts';
import { isEntitledPurchaseStatus } from './purchases.ts';

const orderId = 'order-42';

function makeOrder(attributes = {}) {
  return {
    data: {
      type: 'orders',
      id: orderId,
      attributes: {
        store_id: 7,
        status: 'refunded',
        refunded: true,
        refunded_amount: 2900,
        total: 2900,
        test_mode: false,
        ...attributes
      }
    }
  };
}

function makeLicense(id, attributes = {}) {
  return {
    type: 'license-keys',
    id,
    attributes: {
      order_id: orderId,
      status: 'active',
      disabled: false,
      ...attributes
    }
  };
}

function makeOptions(overrides = {}) {
  return {
    orderId,
    expectedTestMode: false,
    configuredStoreId: '7',
    ...overrides
  };
}

test('a verified full refund records the refund before disabling every active license', async () => {
  const events = [];
  const licenses = [
    makeLicense('license-1'),
    makeLicense('license-2'),
    makeLicense('license-3', { status: 'disabled', disabled: true })
  ];

  const result = await processVerifiedRefund(makeOptions(), {
    getOrder: async () => makeOrder(),
    recordVerifiedRefund: async (kind) => events.push(`record:${kind}`),
    listLicenseKeys: async () => {
      events.push('list');
      return { data: licenses };
    },
    disableLicenseKey: async (licenseId) => {
      events.push(`disable:${licenseId}`);
      return {
        data: makeLicense(licenseId, { status: 'disabled', disabled: true })
      };
    }
  });

  assert.deepEqual(events, ['record:full', 'list', 'disable:license-1', 'disable:license-2']);
  assert.deepEqual(result, {
    kind: 'full',
    licenseCount: 3,
    disabledCount: 2,
    alreadyDisabledCount: 1
  });
});

test('a partial refund keeps licenses untouched', async () => {
  const events = [];
  const result = await processVerifiedRefund(makeOptions(), {
    getOrder: async () => makeOrder({
      status: 'partial_refund',
      refunded: false,
      refunded_amount: 1000
    }),
    recordVerifiedRefund: async (kind) => events.push(`record:${kind}`),
    listLicenseKeys: async () => {
      events.push('unexpected-list');
      return { data: [makeLicense('license-1')] };
    },
    disableLicenseKey: async () => {
      events.push('unexpected-disable');
      throw new Error('Partial refunds must not disable licenses.');
    }
  });

  assert.deepEqual(events, ['record:partial']);
  assert.equal(result.kind, 'partial');
  assert.equal(result.licenseCount, 0);
});

test('a full refund with no license keys is a successful no-op', async () => {
  const result = await processVerifiedRefund(makeOptions(), {
    getOrder: async () => makeOrder(),
    recordVerifiedRefund: async () => undefined,
    listLicenseKeys: async () => ({ data: [] }),
    disableLicenseKey: async () => {
      throw new Error('No key should be disabled.');
    }
  });

  assert.deepEqual(result, {
    kind: 'full',
    licenseCount: 0,
    disabledCount: 0,
    alreadyDisabledCount: 0
  });
});

test('duplicate delivery treats an already-disabled license as success', async () => {
  let patchCount = 0;
  const result = await processVerifiedRefund(makeOptions(), {
    getOrder: async () => makeOrder(),
    recordVerifiedRefund: async () => undefined,
    listLicenseKeys: async () => ({
      data: [makeLicense('license-1', { status: 'disabled', disabled: true })]
    }),
    disableLicenseKey: async () => {
      patchCount += 1;
      throw new Error('An already-disabled key should not be patched again.');
    }
  });

  assert.equal(patchCount, 0);
  assert.equal(result.alreadyDisabledCount, 1);
});

test('a Lemon API failure remains retryable after recording the full refund', async () => {
  const events = [];

  await assert.rejects(
    processVerifiedRefund(makeOptions(), {
      getOrder: async () => makeOrder(),
      recordVerifiedRefund: async (kind) => events.push(`record:${kind}`),
      listLicenseKeys: async () => ({ data: [makeLicense('license-1')] }),
      disableLicenseKey: async () => {
        events.push('disable-failed');
        throw new Error('Temporary Lemon API failure');
      }
    }),
    /Temporary Lemon API failure/
  );

  assert.deepEqual(events, ['record:full', 'disable-failed']);
});

test('an unconfirmed disable response fails closed', async () => {
  await assert.rejects(
    processVerifiedRefund(makeOptions(), {
      getOrder: async () => makeOrder(),
      recordVerifiedRefund: async () => undefined,
      listLicenseKeys: async () => ({ data: [makeLicense('license-1')] }),
      disableLicenseKey: async (licenseId) => ({ data: makeLicense(licenseId) })
    }),
    (error) => error instanceof LemonRefundVerificationError
      && error.code === 'LICENSE_DISABLE_NOT_CONFIRMED'
  );
});

test('store and test-mode mismatches are rejected before state changes', async () => {
  let recordCount = 0;
  const dependencies = {
    getOrder: async () => makeOrder(),
    recordVerifiedRefund: async () => {
      recordCount += 1;
    },
    listLicenseKeys: async () => ({ data: [] }),
    disableLicenseKey: async () => {
      throw new Error('Not reached');
    }
  };

  await assert.rejects(
    processVerifiedRefund(makeOptions({ configuredStoreId: '99' }), dependencies),
    (error) => error instanceof LemonRefundVerificationError
      && error.code === 'REFUND_STORE_MISMATCH'
  );
  await assert.rejects(
    processVerifiedRefund(makeOptions({ expectedTestMode: true }), dependencies),
    (error) => error instanceof LemonRefundVerificationError
      && error.code === 'REFUND_MODE_MISMATCH'
  );
  assert.equal(recordCount, 0);
});

test('partial refunds retain My Products entitlement while full refunds do not', () => {
  assert.equal(isEntitledPurchaseStatus('paid'), true);
  assert.equal(isEntitledPurchaseStatus('partial_refund'), true);
  assert.equal(isEntitledPurchaseStatus('refunded'), false);
  assert.equal(isEntitledPurchaseStatus('fraudulent'), false);
});
