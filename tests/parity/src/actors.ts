import { randomUUID } from 'node:crypto';

import { DEMO_ADMIN_EMAIL, DEMO_PASSWORD } from './env.js';
import { api } from './http.js';

/**
 * Reusable setup a scenario would otherwise repeat: people, sessions, baskets.
 * Every helper goes through the public API — never the database — so the setup
 * itself is exercised against whichever backend is up.
 */

export interface Session {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

function expectStatus(what: string, actual: number, expected: number, body: unknown): void {
  if (actual !== expected) {
    throw new Error(`${what}: expected ${expected}, got ${actual} ${JSON.stringify(body)}`);
  }
}

function toSession(email: string, body: any): Session {
  return {
    userId: body.user.id,
    email,
    accessToken: body.tokens.accessToken,
    refreshToken: body.tokens.refreshToken,
  };
}

/** A fresh shopper with a unique email, so tests never share an account. */
export async function registerShopper(
  options: { cartToken?: string; fullName?: string } = {},
): Promise<Session> {
  const email = `parity-${randomUUID()}@example.com`;
  const res = await api('POST', '/auth/register', {
    cartToken: options.cartToken,
    body: { email, password: DEMO_PASSWORD, fullName: options.fullName ?? 'ทดสอบ พาริตี้' },
  });
  expectStatus('register', res.status, 201, res.body);
  return toSession(email, res.body);
}

export async function login(
  email: string,
  password = DEMO_PASSWORD,
  options: { cartToken?: string } = {},
): Promise<Session> {
  const res = await api('POST', '/auth/login', {
    cartToken: options.cartToken,
    body: { email, password },
  });
  expectStatus(`login ${email}`, res.status, 200, res.body);
  return toSession(email, res.body);
}

export const loginAdmin = (): Promise<Session> => login(DEMO_ADMIN_EMAIL);

/** Resolves a seeded SKU to its variant id through the catalogue. */
export async function variantIdFor(productSlug: string, sku: string): Promise<string> {
  const res = await api('GET', `/products/${productSlug}`);
  expectStatus(`product ${productSlug}`, res.status, 200, res.body);
  const variant = res.body.variants.find((v: { sku: string }) => v.sku === sku);
  if (!variant) throw new Error(`no variant ${sku} on ${productSlug}`);
  return variant.id;
}

export interface Basket {
  /** Set for a guest basket; a signed-in shopper's basket has none. */
  cartToken?: string;
  cart: any;
}

/**
 * Fills a basket. Pass `token` for a shopper's basket, `cartToken` to keep adding
 * to a guest basket, or neither to start a new guest basket.
 */
export async function fillBasket(
  lines: Array<{ variantId: string; quantity: number }>,
  owner: { token?: string; cartToken?: string } = {},
): Promise<Basket> {
  let cartToken = owner.cartToken;
  let cart: any;
  for (const line of lines) {
    const res = await api('POST', '/carts/me/items', {
      token: owner.token,
      cartToken,
      body: line,
    });
    expectStatus('add to basket', res.status, 200, res.body);
    cartToken = owner.token ? undefined : (res.headers.get('x-cart-token') ?? cartToken);
    cart = res.body;
  }
  return { cartToken, cart };
}

export const THAI_ADDRESS = {
  recipientName: 'สมชาย ใจดี',
  phone: '0812345678',
  line1: '123 ถนนสุขุมวิท',
  city: 'กรุงเทพมหานคร',
  province: 'กรุงเทพมหานคร',
  postalCode: '10110',
  country: 'TH',
};

export const PROBLEM = (slug: string) => `https://errors.example.com/${slug}`;

/** A test card the mock provider settles successfully. */
export const SUCCEEDING_CARD = '4242424242424242';

/** A variant's raw stock as the back office sees it, found by SKU. */
export async function stockOf(
  adminToken: string,
  sku: string,
): Promise<{ stockOnHand: number; stockReserved: number }> {
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ limit: '50', ...(cursor ? { cursor } : {}) });
    const res = await api('GET', `/admin/products?${query}`, { token: adminToken });
    expectStatus('admin products', res.status, 200, res.body);
    for (const product of res.body.items) {
      const variant = product.variants.find((v: { sku: string }) => v.sku === sku);
      if (variant) return { stockOnHand: variant.stockOnHand, stockReserved: variant.stockReserved };
    }
    cursor = res.body.nextCursor;
  } while (cursor);
  throw new Error(`no variant ${sku} in the back office`);
}

/** Checks the caller's basket out with a fresh Idempotency-Key. Returns the response. */
export function checkout(token: string, idempotencyKey: string = randomUUID()) {
  return api('POST', '/checkout', {
    token,
    idempotencyKey,
    body: { shippingAddress: THAI_ADDRESS, paymentMethod: 'card' },
  });
}

/**
 * Polls until `predicate` holds, for outcomes that arrive asynchronously — the
 * provider's webhook, the reservation sweeper. Returns the last value seen.
 */
export async function eventually<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  { timeoutMs = 20_000, intervalMs = 250 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!predicate(value)) {
    if (Date.now() > deadline) {
      throw new Error(`condition not met within ${timeoutMs}ms; last value ${JSON.stringify(value)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    value = await read();
  }
  return value;
}
