/**
 * The only place the suite learns where it is pointed. There is deliberately no
 * default: a suite that falls back to localhost:3000 tests the Node process on a
 * developer's machine while claiming to have tested "the backend", and nobody
 * notices until Java fails in CI.
 *
 * Nothing in this suite may ask which backend it is talking to. A test that needs
 * `if (backend === 'java')` has found a hole in contract/openapi.yaml — fix the
 * contract, not the test.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required — e.g. ${name}=http://localhost:8080/api/v1 make test-parity`,
    );
  }
  return value;
}

export const API_BASE_URL = required('API_BASE_URL').replace(/\/+$/, '');

/**
 * Reset reaches past the API to the shared database, which is backend-neutral:
 * Flyway owns it and both backends read the same rows. Redis holds only caches
 * and locks, so it is flushed when reachable and skipped when not.
 */
export const DATABASE_URL = required('PARITY_DATABASE_URL');
export const REDIS_URL = process.env.PARITY_REDIS_URL;

export const DEMO_PASSWORD = 'DemoPass123!';
export const DEMO_ADMIN_EMAIL = 'admin@vibecode.shop';
export const DEMO_SHOPPER_EMAIL = 'somchai@example.com';
