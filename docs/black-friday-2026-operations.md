# Black Friday 2026: Production operations runbook

The owner approved the price table for Preview implementation on November 13, 2026. Live build `8d28223` was deployed on November 18. On November 19, the owner approved changing both campaign boundaries to midnight in Korea, as specified below. That schedule update requires a new deployment; it does not require a database migration. Historical implementation and test notes below describe the November 13 work.

## Approved prices and existing Live mapping

All amounts are USD. Percentages are rounded down against the **current selling price**, not the older `regularPrice` comparison field. For example, Nebula Bundle's current selling price is $189, while its legacy comparison field is $255.

| Product | Before | Black Friday | After | BF discount | Product ID | Variant ID |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Nebula Crush | 39 | 19 | 29 | 51% | 1374754 | 2147828 |
| Nebula Drift | 49 | 25 | 39 | 48% | 1374755 | 2147829 |
| Nebula Drums | 49 | 25 | 39 | 48% | 1374756 | 2147830 |
| Nebula Rift | 59 | 29 | 49 | 50% | 1374757 | 2147831 |
| Nebula Space | 59 | 29 | 49 | 50% | 1374760 | 2147834 |
| Nebula Bundle | 189 | 89 | 129 | 52% | 1374758 | 2147832 |
| Jeju Citrus Air | 29 | 15 | 25 | 48% | 1374753 | 2147827 |
| Boseong Green Tea | 29 | 15 | 25 | 48% | 1374767 | 2147845 |
| Uiseong Garlic | 29 | 15 | 25 | 48% | 1374762 | 2147836 |
| Organic Bundle | 69 | 35 | 59 | 49% | 1374761 | 2147835 |
| Glitch Drum Pack Vol. I | 49 | 25 | 39 | 48% | 1374752 | 2147826 |

These mappings are verified against the repository catalog, not a current authenticated merchant API response. Existing Product/Variant IDs, permanent checkout URLs, and license/entitlement mapping are unchanged. No new variants are required.

## Time and environment modes

- Timezone: `Asia/Seoul` (KST, UTC+09:00).
- Inclusive start: `2026-11-19T15:00:00.000Z` = Nov 20 00:00 KST.
- Exclusive end: `2026-12-01T15:00:00.000Z` = Dec 2 00:00 KST.
- The whole day of December 1 in Korea is included.
- `BLACK_FRIDAY_2026_ENABLED=true` is the server-only Live activation flag. It is **off by default**. Do not enable it in Production until the remaining merchant/API checks and owner deployment approval are complete.
- Existing Preview detection enables a design sandbox independently of that Live flag. Preview always blocks checkout before authentication, claim creation, or Lemon access; omits GA/Ads and the Lemon overlay; and emits noindex metadata/headers. Removing the visible Preview notice does not remove these guards.
- Production ignores Preview forcing even if `?bf=active` is supplied. Live sale activation never turns on Preview mode.
- In Preview, `?bf=before`, `?bf=active`, and `?bf=after` are design views. Open a fresh URL/reload to change them immediately. Product soft navigation preserves the selected view. Without a forced view, Preview follows server time.
- The status API `/api/campaign/status` is dynamic and private/no-store, with CDN caching disabled. Pages do not embed a static time-based phase. The client starts unready, obtains a server snapshot, uses monotonic elapsed time for boundary timers, and revalidates on focus, visibility, reconnection, and a 30-second poll. Checkout is disabled while campaign time is unready and is always checked again on the server.
- After the end, keep the campaign flag **enabled**: the `after` state supplies the approved new regular prices and retains price verification. Turning the flag off would restore legacy price behavior.

## Checkout behavior

1. Preview returns 403 without creating claims or touching Lemon.
2. Live authenticates the account and resolves the unchanged official catalog mapping.
3. When the campaign flag is enabled, the request must contain the displayed `expectedPhase` and `expectedPriceCents`. The server calculates its own expected price; client values can only reject a stale screen.
4. Fresh, uncached API GETs verify the store currency, published Live product, mapped Live variant, fixed one-time pricing, and latest Price resource. Lemon's pending single/default variant is accepted only when a listing proves it is the product's only variant.
5. Only after verification is an account claim created. The server creates a single-variant checkout, passes the original account claim, requests quantity 1 and a price preview, disables the discount field, and supplies no custom price or discount code.
6. The returned checkout is verified for mapping, Live mode, quantity, claim, currency, zero discount, amounts, expiry, and a matching signed checkout URL. Unrecognized responses fail closed. There is no fallback to an unchecked permanent URL.
7. Phase is checked again between asynchronous steps. Checkout expiry is at most 10 minutes and never after the next phase boundary. New checkouts are refused in the last 30 seconds before a boundary to avoid immediately expiring links.
8. The browser rejects late responses after a phase/mode change or component unmount. `begin_checkout` uses the verified price. Existing paid-order-only purchase/Ads conversion and claim/license recovery paths remain unchanged.

Required existing server settings include `LEMON_API_KEY`, `LEMON_STORE_ID`, the Supabase server key and project URL, and the existing webhook signing secret. Public Supabase and GA/Ads configuration remains as before. **New required setting when enabling Live validation:** `LEMON_PRICE_TAX_MODE=exclusive` or `inclusive`, matching the actual merchant tax setting. Do not guess or expose secret values.

- Exclusive mode: displayed product base price equals subtotal; total must equal subtotal plus tax.
- Inclusive mode: displayed price equals total; included tax is checked separately. Both documented gross-subtotal and net-subtotal representations are supported without relaxing the exact total.
- The displayed price is not a promise that tax-exclusive orders have no tax. Final geographic tax is determined in hosted checkout after billing details.

## Evidence required before Production activation

The local environment has no usable Lemon API credentials or isolated Lemon Test product configuration. No real API checkout creation, payment, refund, license issuance, customer record change, or Production read/write was performed for this implementation.

Before enabling the Live flag, obtain these concrete results:

1. Read the actual merchant tax mode and confirm `LEMON_PRICE_TAX_MODE`. Verify API access to Stores, Products, Variants, Prices, and Checkouts.
2. Confirm all 11 Live mappings and current base prices through authenticated read-only GETs. Code agreement alone is not merchant verification.
3. In a separate Lemon Test store/configuration and isolated Supabase environment, confirm the actual create-checkout response includes the requested `checkout_data.custom` claim and `variant_quantities`, price preview fields, expiry, and supported signed URL format. The official response examples do not establish that all request fields are echoed. **If these fields are absent, the current implementation returns 503 safely; merchant compatibility is not yet PASS.**
4. Exercise matching and mismatching before/active/after prices in that isolated environment, including tax-inclusive/exclusive cases, address/currency changes, discount controls, quantity controls, and an already-open hosted checkout at expiry. Creation-time price verification does not prove every later hosted-checkout interaction is immutable.
5. Complete a Test payment and verify signed webhook, purchase/claim ownership, account display and license issuance. Use separate Test mappings/keys/DB; do not relax Production Live-only ownership rules. Lemon Test Mode does not permit normal file downloads, so actual downloadable file availability remains a separate merchant check.
6. Verify published Preview build noindex and absent GA/Ads/Lemon scripts. Verify the candidate Live build retains the existing analytics and overlay configuration with Preview forcing disabled. Do not use Production customer accounts for Preview testing.

## Manual launch and end sequence (price changes pending)

1. Review the implementation and test evidence; complete the merchant contract checks above; obtain separate Production deployment approval.
2. Confirm Vercel Production Branch/domain automation, current SHA, a compatible rollback deployment, and the intended environment settings. Deploy the reviewed candidate without accidental domain promotion, verify Ready and SHA, then use the approved production promotion process. This change needs **no DB migration**.
3. Before Nov 20 00:00 KST, the verified Live candidate should show the original design and current prices. Check the dynamic status API returns `phase: before`, `previewMode: false`, `campaignEnabled: true`, and the exact UTC boundaries. Do not modify variants or licensing.
4. At **Nov 20 00:00 KST**, the owner changes the base prices of the existing 11 Lemon variants to the Black Friday column. The website changes automatically at the boundary. Products not yet updated remain blocked at checkout with a price-update message; already updated products can pass validation. There is no atomic cross-system switch and no claim that manual updates are instantaneous.
5. At **Dec 2 00:00 KST**, the owner changes those same 11 variants to the **After** column. The website returns to its original design with the new regular prices. Any variant still on its BF price remains safely blocked. Keep the Live flag enabled.
6. At each transition, verify status, displayed/detail/cart price agreement, and each variant's base price. Monitor checkout validation warnings and existing webhook/recovery operations. Do not silently bypass a mismatch to restore conversion.

No scheduled human action is required for the website design itself after the reviewed Live flag is deployed. The two sets of Lemon base-price updates are manual. There is no discount-code setup.

After deploying the schedule update, ask users with already-open tabs to refresh the browser. The previous build expects the old UTC boundaries and rejects a snapshot containing the new boundaries; polling alone does not update that tab's JavaScript. Reload before checking the countdown or starting checkout.

## Monitoring and recovery

- Checkout logs: `[Checkout Session] Price verification rejected checkout.` includes only product slug, phase, error code and reason. `PRICE_CHANGED` is a mismatch/stale screen/near-boundary case; `PRICE_CHECK_UNAVAILABLE` includes missing merchant configuration, unsupported response or API outage. The customer sees a short price-confirmation/update message instead of those technical reasons.
- Use the existing `docs/payment-operations.md` read-only status and exact-order reconciliation procedures for webhook/claim/license failures. Do not blindly replay all orders or alter NFR/unmapped records.
- A failed checkout API call may leave an unused claim; it does not grant an entitlement or count as a purchase. Existing expiry/recovery behavior is retained.
- Do not roll back to an older unchecked checkout deployment after Lemon prices change, and do not turn off the campaign flag as a price-mismatch workaround. Use a rollback build that retains this guard and the matching phase price table, or pause purchasing through an approved operational procedure while resolving the problem.
- Previously distributed permanent Lemon links, old deployments, and checkouts opened before this guarded build remain outside this application's new request path. Review merchant-side expiry/price behavior for them before launch; this implementation does not revoke those URLs.

## Local verification commands

Recorded local results on November 13, 2026:

- Full automated suite: **215/215 PASS**, including existing ownership/refund/license/analytics and SQL migration regressions.
- TypeScript: `tsc --noEmit --incremental false` PASS.
- Optimized Preview `next build`: PASS. Scoped ESLint: 0 errors, 33 image-optimization warnings. The build also reports the pre-existing multiple-lockfile workspace-root warning; no lockfiles were removed.
- Actual local browser: all 11 homepage prices match before/active/after; Nebula Bundle desktop/mobile, Organic and Glitch price layouts checked; no horizontal overflow in the checked 390px views. Synthetic server time advanced an already-open home across the start and an already-open Nebula page across the end. The end retained the Nebula theme and changed $89 to $129 without an external navigation.
- Optimized local Preview server: three phase views work after static build; dynamic status has `private, no-store` plus CDN `no-store`; index headers remain disabled; direct checkout request returns 403; no GA/Ads/Lemon overlay scripts appear.
- Visibility/focus recovery, invalid browser clocks, delayed responses, timeouts, and unmount races were exercised with isolated component/provider fixtures. Actual cloud cache behavior and merchant payment behavior remain unverified.

Main implementation files:

| Purpose | Files |
| --- | --- |
| Approved central prices and schedule | `lib/campaigns/blackFridayPricing.ts`, `blackFridayClock.ts`, `blackFriday2026.ts` |
| Dynamic server clock and client refresh | `app/api/campaign/status/route.ts`, `components/campaigns/BlackFridayPreviewProvider.tsx`, `app/layout.tsx` |
| Product/cart/banner UI | `components/farmverb/FarmVerbSite.tsx`, `components/campaigns/BlackFridayCampaign.tsx`, `BlackFridayPurchasePanel.tsx`, `BlackFridayPurchasePanel.module.css`, `app/cart/page.tsx`, `app/globals.css` |
| Checkout verification and existing claim handoff | `app/api/checkout/session/route.ts`, `lib/checkout/priceValidation.ts`, `lemonCheckout.server.ts`, `components/checkout/LemonCheckoutLink.tsx`, `lib/payments/lemonApi.server.ts` |
| Funnel price context | `lib/analytics/products.ts` |
| New regressions | `lib/campaigns/blackFridayClock.test.mjs`, `blackFridayPricing.test.mjs`, `app/api/campaign/status/route.test.mjs`, `app/api/checkout/session/route.price.test.mjs`, `lib/checkout/priceValidation.test.mjs`, `lemonCheckoutLink.test.mjs` |
| Existing test adjustment and registration | `app/api/checkout/session/route.preview.test.mjs`, `package.json` |

No Supabase schema, original catalog/variant mapping, baseline `lib/pricing/products.ts`, webhook/entitlement implementation, or Production environment configuration was changed.

```sh
npm test
npx tsc --noEmit --incremental false
```

Local UI preview (use only local/synthetic Supabase settings):

```sh
NEXT_PUBLIC_BLACK_FRIDAY_PREVIEW=true npm run dev -- --hostname 127.0.0.1 --port 3100
```

Open `http://127.0.0.1:3100/?bf=active`, `/nebula?bf=active`, or `/?bf=after`. A Preview production build should use the existing Vercel Preview branch gate.

For real open-tab boundary checks, restart the local dev server with `BLACK_FRIDAY_PREVIEW_CLOCK_START=2026-11-19T14:59:20.000Z` (40 seconds before the start) or `2026-12-01T14:59:20.000Z` (40 seconds before the end). The first status request starts a monotonic simulated server clock. Open a URL with **no `bf` override** and observe it across the next 40 seconds without source edits/reload. This development fixture is ignored by production builds and Live mode. Remove it after testing.

Automated coverage includes the approved 11-product table, boundary milliseconds, stale/malformed clocks, Preview gates, cart repricing, checkout mismatches/timeout/phase races, claim preservation, client unmount/mode races, and the existing purchase/refund/license/analytics/SQL regressions. These tests use synthetic fixtures and do not count as a real merchant payment test. Local authenticated cart GUI verification additionally requires a running isolated Supabase Auth instance; it was not available in the current environment.

Primary API references: [Create checkout](https://docs.lemonsqueezy.com/api/checkouts/create-checkout), [Price objects](https://docs.lemonsqueezy.com/api/prices/the-price-object), [Price ordering](https://docs.lemonsqueezy.com/api/prices/list-all-prices), [Tax-inclusive pricing](https://docs.lemonsqueezy.com/help/payments/sales-tax-vat#tax-inclusive-pricing), [Test Mode](https://docs.lemonsqueezy.com/help/getting-started/test-mode).
