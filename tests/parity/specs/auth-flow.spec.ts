import { describe, expect, it } from 'vitest';

import { PROBLEM, login, registerShopper } from '../src/actors.js';
import { api } from '../src/http.js';

/**
 * The whole session lifecycle, with the rotation rule that matters most: presenting a
 * refresh token that was already rotated revokes the entire family, so the attacker's
 * copy and the victim's newer one both stop working (docs/auth-tokens.md).
 */
describe('auth flow', () => {
  const refresh = (refreshToken: string) => api('POST', '/auth/refresh', { body: { refreshToken } });

  it('rotates on refresh, and a reused token revokes the whole family', async () => {
    // 1. register → 201 + a pair
    const registered = await registerShopper();

    // 2. login → 200 + a different pair (a new family)
    const session = await login(registered.email);
    expect(session.refreshToken).not.toBe(registered.refreshToken);

    // 3. the access token identifies the account
    const me = await api('GET', '/auth/me', { token: session.accessToken });
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(registered.userId);

    // 4. refresh #1 → 200 + refresh #2
    const first = await refresh(session.refreshToken);
    expect(first.status).toBe(200);
    expect(first.body.tokenType).toBe('Bearer');
    const second = first.body.refreshToken as string;
    expect(second).not.toBe(session.refreshToken);

    // 5. refresh #1 again → 401: reuse detected
    const reused = await refresh(session.refreshToken);
    expect(reused.status).toBe(401);
    expect(reused.body.type).toBe(PROBLEM('token-reuse-detected'));

    // 6. refresh #2 → 401: the family is gone, not just the reused token
    const afterRevocation = await refresh(second);
    expect(afterRevocation.status).toBe(401);
  });

  it('leaves another sign-in of the same account working after a family is revoked', async () => {
    const registered = await registerShopper();
    const laptop = await login(registered.email);
    const phone = await login(registered.email);

    await refresh(laptop.refreshToken);
    await refresh(laptop.refreshToken); // reuse: laptop's family is revoked

    expect((await refresh(phone.refreshToken)).status).toBe(200);
  });

  it('ends the session on logout, and logout is idempotent', async () => {
    const shopper = await registerShopper();
    const body = { refreshToken: shopper.refreshToken };

    expect((await api('POST', '/auth/logout', { token: shopper.accessToken, body })).status).toBe(204);
    expect((await refresh(shopper.refreshToken)).status).toBe(401);
    expect((await api('POST', '/auth/logout', { body })).status).toBe(204);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const shopper = await registerShopper();
    const wrongPassword = await api('POST', '/auth/login', {
      body: { email: shopper.email, password: 'not-the-password' },
    });
    const unknownEmail = await api('POST', '/auth/login', {
      body: { email: `nobody-${shopper.userId}@example.com`, password: 'not-the-password' },
    });

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body.type).toBe(PROBLEM('invalid-credentials'));
    }
  });

  it('refuses a duplicate email, case-insensitively', async () => {
    const shopper = await registerShopper();
    const again = await api('POST', '/auth/register', {
      body: { email: shopper.email.toUpperCase(), password: 'DemoPass123!', fullName: 'ซ้ำ' },
    });

    expect(again.status).toBe(409);
    expect(again.body.type).toBe(PROBLEM('email-already-registered'));
  });
});
