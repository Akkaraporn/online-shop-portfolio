import { beforeAll, describe, expect, it } from 'vitest';

import {
  PROBLEM,
  SUCCEEDING_CARD,
  type Session,
  checkout,
  eventually,
  fillBasket,
  loginAdmin,
  registerShopper,
  stockOf,
  variantIdFor,
} from '../src/actors.js';
import { lapseReservations } from '../src/db.js';
import { api } from '../src/http.js';

/**
 * Every way a checkout can end, asserted on what the shop holds afterwards — stock on
 * hand and reserved, read through the back office — rather than on what any response
 * says about it. Each scenario compares against its own "before", so they do not
 * depend on one another's order.
 */
describe('purchase', () => {
  let admin: Session;
  const SKU = 'TEE-CR-L';
  let variantId: string;

  beforeAll(async () => {
    admin = await loginAdmin();
    variantId = await variantIdFor('crewneck-organic-tee', SKU);
  });

  const stock = () => stockOf(admin.accessToken, SKU);
  const order = (token: string, orderNumber: string) =>
    api('GET', `/orders/${orderNumber}`, { token });

  /** A shopper with `quantity` of the variant in their basket, checked out. */
  async function placeOrder(quantity = 2) {
    const shopper = await registerShopper();
    await fillBasket([{ variantId, quantity }], { token: shopper.accessToken });
    const res = await checkout(shopper.accessToken);
    expect(res.status).toBe(201);
    return { shopper, placed: res.body };
  }

  it('reserves at checkout, moves nothing at confirm, and sells on the webhook', async () => {
    const before = await stock();
    const { shopper, placed } = await placeOrder(2);

    expect(placed.status).toBe('pending_payment');
    expect(placed.cancellable).toBe(true);
    expect(await stock()).toEqual({
      stockOnHand: before.stockOnHand,
      stockReserved: before.stockReserved + 2,
    });

    const confirmed = await api('POST', `/payments/${placed.payment.id}/confirm`, {
      token: shopper.accessToken,
      body: { cardNumber: SUCCEEDING_CARD },
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe('processing');
    // Confirm is a promise, not a sale: only the provider's webhook moves stock.
    expect((await stock()).stockOnHand).toBe(before.stockOnHand);

    const paid = await eventually(
      async () => (await order(shopper.accessToken, placed.orderNumber)).body,
      (o) => o.status === 'paid',
    );
    expect(paid.cancellable).toBe(false);
    expect(await stock()).toEqual({
      stockOnHand: before.stockOnHand - 2,
      stockReserved: before.stockReserved,
    });

    // A paid order is a refund to cancel, which this shop does not do.
    const cancel = await api('POST', `/orders/${placed.orderNumber}/cancel`, {
      token: shopper.accessToken,
    });
    expect(cancel.status).toBe(409);
    expect(cancel.body.type).toBe(PROBLEM('order-not-cancellable'));
  });

  it('empties the basket once the order exists', async () => {
    const { shopper } = await placeOrder(1);
    const basket = await api('GET', '/carts/me', { token: shopper.accessToken });

    expect(basket.body.items).toEqual([]);
  });

  it('gives a cancelled order its stock back, and cancelling twice is not an error', async () => {
    const before = await stock();
    const { shopper, placed } = await placeOrder(3);
    const cancel = () =>
      api('POST', `/orders/${placed.orderNumber}/cancel`, { token: shopper.accessToken });

    const first = await cancel();
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('cancelled');
    expect(first.body.cancellable).toBe(false);
    expect(await stock()).toEqual(before);

    const second = await cancel();
    expect(second.status).toBe(200);
    expect(second.body.status).toBe('cancelled');
    expect(await stock()).toEqual(before);

    const confirm = await api('POST', `/payments/${placed.payment.id}/confirm`, {
      token: shopper.accessToken,
      body: { cardNumber: SUCCEEDING_CARD },
    });
    expect(confirm.status).toBe(409);
    expect(confirm.body.type).toBe(PROBLEM('payment-not-confirmable'));
  });

  it('expires an unpaid order when its reservation lapses, and releases the stock', async () => {
    const before = await stock();
    const { shopper, placed } = await placeOrder(2);
    expect((await stock()).stockReserved).toBe(before.stockReserved + 2);

    await lapseReservations(placed.orderNumber);

    const expired = await eventually(
      async () => (await order(shopper.accessToken, placed.orderNumber)).body,
      (o) => o.status === 'expired',
      // One sweep interval plus slack; the dev stack sweeps every few seconds.
      { timeoutMs: 75_000, intervalMs: 500 },
    );
    expect(expired.cancellable).toBe(false);
    expect(await stock()).toEqual(before);
  }, 90_000);

  describe('authorization', () => {
    it("is 403, not 404, for someone else's order and payment", async () => {
      const { placed } = await placeOrder(1);
      const intruder = await registerShopper();

      const read = await order(intruder.accessToken, placed.orderNumber);
      expect(read.status).toBe(403);
      expect(read.body.type).toBe(PROBLEM('forbidden'));

      const cancel = await api('POST', `/orders/${placed.orderNumber}/cancel`, {
        token: intruder.accessToken,
      });
      expect(cancel.status).toBe(403);

      const confirm = await api('POST', `/payments/${placed.payment.id}/confirm`, {
        token: intruder.accessToken,
        body: { cardNumber: SUCCEEDING_CARD },
      });
      expect(confirm.status).toBe(403);
    });

    it("keeps someone else's orders out of a shopper's history", async () => {
      const { shopper, placed } = await placeOrder(1);
      const other = await registerShopper();

      const mine = await api('GET', '/orders', { token: shopper.accessToken });
      const theirs = await api('GET', '/orders', { token: other.accessToken });

      expect(mine.body.items.map((o: { orderNumber: string }) => o.orderNumber)).toEqual([
        placed.orderNumber,
      ]);
      expect(theirs.body.items).toEqual([]);
    });

    it('is 404 for an order number nobody has', async () => {
      const shopper = await registerShopper();
      const res = await order(shopper.accessToken, 'ORD-2026-9999999');

      expect(res.status).toBe(404);
      expect(res.body.type).toBe(PROBLEM('not-found'));
    });

    it('needs a signed-in user to check out at all', async () => {
      const guest = await fillBasket([{ variantId, quantity: 1 }]);
      const res = await api('POST', '/checkout', {
        cartToken: guest.cartToken,
        idempotencyKey: crypto.randomUUID(),
        body: {},
      });

      expect(res.status).toBe(401);
    });
  });
});
