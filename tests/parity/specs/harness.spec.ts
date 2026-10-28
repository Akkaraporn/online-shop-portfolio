import { describe, expect, it } from 'vitest';

import {
  fillBasket,
  loginAdmin,
  registerShopper,
  variantIdFor,
} from '../src/actors.js';
import { api } from '../src/http.js';
import { resetDatabase } from '../src/reset.js';

/**
 * The harness proving itself before 4.2 builds scenarios on it: the helpers work
 * against whichever backend is up, and a reset genuinely restores the seed.
 */

describe('harness', () => {
  it('reaches the backend', async () => {
    const res = await api('GET', '/health');
    expect(res.status).toBe(200);
  });

  it('gets problem+json with a traceId for a path nobody claims', async () => {
    const res = await api('GET', '/no-such-route');
    expect(res.status).toBe(404);
    expect(res.contentType).toContain('application/problem+json');
    expect(res.body.traceId).toEqual(expect.any(String));
  });

  it('registers a shopper who can then identify themself', async () => {
    const shopper = await registerShopper();
    const me = await api('GET', '/auth/me', { token: shopper.accessToken });
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(shopper.email);
  });

  it('fills a guest basket and carries it into a new account', async () => {
    const variantId = await variantIdFor('canvas-tote-bag', 'TOTE-M');
    const guest = await fillBasket([{ variantId, quantity: 1 }]);
    expect(guest.cartToken).toEqual(expect.any(String));

    const shopper = await registerShopper({ cartToken: guest.cartToken });
    const cart = await api('GET', '/carts/me', { token: shopper.accessToken });
    expect(cart.body.items.map((i: { variantId: string }) => i.variantId)).toEqual([variantId]);
  });

  it('restores seeded stock on reset', async () => {
    const admin = await loginAdmin();
    const variantId = await variantIdFor('canvas-tote-bag', 'TOTE-M');
    // By SKU, not id: the seed lets variant ids default, so a reset issues new ones.
    const stockOf = async () =>
      (await api('GET', '/products/canvas-tote-bag')).body.variants.find(
        (v: { sku: string }) => v.sku === 'TOTE-M',
      ).availableStock;

    expect(await stockOf()).toBe(1);
    const adjusted = await api('PATCH', `/admin/variants/${variantId}/stock`, {
      token: admin.accessToken,
      body: { delta: 5, reason: 'parity harness reset check' },
    });
    expect(adjusted.status).toBe(200);
    expect(await stockOf()).toBe(6);

    await resetDatabase();
    expect(await stockOf()).toBe(1);
  });
});
