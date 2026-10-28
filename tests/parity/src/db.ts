import pg from 'pg';

import { DATABASE_URL } from './env.js';

/**
 * The suite's only way past the API, used for two things the API cannot do: put the
 * shared database back to the seed, and move time forward. Both act on the schema
 * Flyway owns — the one thing the two backends share — so neither knows or cares
 * which backend is up.
 */
export async function withDatabase<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/**
 * Makes an order's stock reservations lapse now, instead of after
 * `RESERVATION_TTL_MINUTES`. The sweeper then finds them on its next run, exactly as
 * it would a quarter of an hour later — which is the behaviour under test. Shortening
 * the TTL for the whole stack instead would expire every other scenario's checkouts.
 */
export async function lapseReservations(orderNumber: string): Promise<void> {
  await withDatabase(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE stock_reservations
          SET expires_at = now() - interval '1 second'
        WHERE status = 'held'
          AND order_id = (SELECT id FROM orders WHERE order_number = $1)`,
      [orderNumber],
    );
    if (!rowCount) throw new Error(`no held reservations for ${orderNumber}`);
  });
}
