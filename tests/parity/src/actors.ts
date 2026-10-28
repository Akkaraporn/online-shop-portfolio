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
