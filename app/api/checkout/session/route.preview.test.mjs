import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceLoader } from '../../../../lib/test/loadSourceModule.mjs';

test('Black Friday preview blocks checkout before auth or account-claim access', async () => {
  let authAccessed = false;
  let claimAccessed = false;
  const load = createSourceLoader({
    globals: {
      process: {
        env: {
          NEXT_PUBLIC_BLACK_FRIDAY_PREVIEW: 'true'
        }
      }
    },
    mocks: {
      'next/server': {
        NextResponse: {
          json: (body, init = {}) => Response.json(body, init)
        }
      },
      '@/lib/checkout/accountClaim': {
        buildAccountClaimCheckoutUrl: () => {
          claimAccessed = true;
          throw new Error('Account claim URL must not be built in preview.');
        }
      },
      '@/lib/checkout/accountClaim.server': {
        AccountClaimStorageError: class AccountClaimStorageError extends Error {},
        createPurchaseAccountClaim: async () => {
          claimAccessed = true;
          throw new Error('Account claim must not be created in preview.');
        }
      },
      '@/lib/supabase/server': {
        createServerSupabaseClient: () => {
          authAccessed = true;
          throw new Error('Supabase must not be accessed in preview.');
        }
      }
    }
  });

  const { POST } = load('app/api/checkout/session/route.ts');
  const response = await POST(new Request('https://preview.example/api/checkout/session', {
    method: 'POST',
    headers: {
      authorization: 'Bearer should-not-be-read',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ productName: 'Nebula Space' })
  }));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: 'Checkout is disabled in this design preview.'
  });
  assert.equal(authAccessed, false);
  assert.equal(claimAccessed, false);
});
