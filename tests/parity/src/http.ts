import { API_BASE_URL } from './env.js';

export interface ApiResponse<T = any> {
  status: number;
  headers: Headers;
  contentType: string;
  body: T;
}

export interface RequestOptions {
  body?: unknown;
  token?: string;
  cartToken?: string;
  idempotencyKey?: string;
  headers?: Record<string, string>;
}

/**
 * A thin `fetch`. It never throws on a status: every assertion about a 4xx is
 * part of the contract, so the test sees the response exactly as a client would.
 */
export async function api<T = any>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.cartToken) headers['x-cart-token'] = options.cartToken;
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();
  const body = text && contentType.includes('json') ? JSON.parse(text) : text;
  return { status: response.status, headers: response.headers, contentType, body };
}
