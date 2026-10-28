import { beforeAll, describe, expect, it } from 'vitest';

import {
  type Session,
  fillBasket,
  login,
  loginAdmin,
  registerShopper,
  stockOf,
  variantIdFor,
} from '../src/actors.js';
import { api } from '../src/http.js';

/**
 * A guest's basket must survive signing in, whichever way they sign in. Asserted on
 * the basket the server returns afterwards, line by line — never on a response
 * message.
 */
describe('cart merge', () => {
  let admin: Session;
  let tee: string;
  let mug: string;

  const linesOf = (cart: any) =>
    Object.fromEntries(
      cart.items.map((i: { variantId: string; quantity: number }) => [i.variantId, i.quantity]),
    );

  beforeAll(async () => {
    admin = await loginAdmin();
    tee = await variantIdFor('crewneck-organic-tee', 'TEE-CR-M');
    mug = await variantIdFor('matte-ceramic-mug', 'MUG-CR-WH');

    // Enough stock that two 60-unit lines are each addable, so the merge cap is
    // what limits the sum and not the add-to-basket stock check.
    const adjusted = await api('PATCH', `/admin/variants/${tee}/stock`, {
      token: admin.accessToken,
      body: { delta: 200, reason: 'parity: merge cap scenario' },
    });
    expect(adjusted.status).toBe(200);
  });

  it('carries a guest basket through registration, logout and login', async () => {
    const guest = await fillBasket([
      { variantId: tee, quantity: 2 },
      { variantId: mug, quantity: 1 },
    ]);

    const shopper = await registerShopper({ cartToken: guest.cartToken });
    const afterRegister = await api('GET', '/carts/me', { token: shopper.accessToken });
    expect(linesOf(afterRegister.body)).toEqual({ [tee]: 2, [mug]: 1 });
    expect(afterRegister.headers.get('x-cart-token')).toBeNull();

    await api('POST', '/auth/logout', {
      token: shopper.accessToken,
      body: { refreshToken: shopper.refreshToken },
    });
    const again = await login(shopper.email);
    const afterLogin = await api('GET', '/carts/me', { token: again.accessToken });
    expect(linesOf(afterLogin.body)).toEqual({ [tee]: 2, [mug]: 1 });
  });

  it('sums shared lines, moves the rest, and caps a line at 99', async () => {
    const shopper = await registerShopper();
    await fillBasket([{ variantId: tee, quantity: 60 }], { token: shopper.accessToken });

    const guest = await fillBasket([
      { variantId: tee, quantity: 60 },
      { variantId: mug, quantity: 3 },
    ]);

    const merged = await api('POST', '/carts/me/merge', {
      token: shopper.accessToken,
      body: { cartToken: guest.cartToken },
    });
    expect(merged.status).toBe(200);
    expect(linesOf(merged.body)).toEqual({ [tee]: 99, [mug]: 3 });
  });

  it('is idempotent: merging the same token again changes nothing', async () => {
    const shopper = await registerShopper();
    await fillBasket([{ variantId: mug, quantity: 1 }], { token: shopper.accessToken });
    const guest = await fillBasket([{ variantId: mug, quantity: 2 }]);
    const merge = () =>
      api('POST', '/carts/me/merge', {
        token: shopper.accessToken,
        body: { cartToken: guest.cartToken },
      });

    const first = await merge();
    const second = await merge();

    expect(second.status).toBe(200);
    expect(linesOf(second.body)).toEqual(linesOf(first.body));
    expect(linesOf(second.body)).toEqual({ [mug]: 3 });
  });

  it('returns the current basket for a token it has never seen', async () => {
    const shopper = await registerShopper();
    await fillBasket([{ variantId: mug, quantity: 1 }], { token: shopper.accessToken });

    const merged = await api('POST', '/carts/me/merge', {
      token: shopper.accessToken,
      body: { cartToken: 'never-issued-by-this-api' },
    });

    expect(merged.status).toBe(200);
    expect(linesOf(merged.body)).toEqual({ [mug]: 1 });
  });

  it('reserves nothing: holding the basket leaves stock untouched', async () => {
    const before = await stockOf(admin.accessToken, 'MUG-CR-WH');
    await fillBasket([{ variantId: mug, quantity: 5 }]);
    const after = await stockOf(admin.accessToken, 'MUG-CR-WH');

    expect(after).toEqual(before);
  });
});
