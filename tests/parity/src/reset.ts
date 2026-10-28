import { readFile } from 'node:fs/promises';

import { Redis } from 'ioredis';
import pg from 'pg';

import { DATABASE_URL, REDIS_URL } from './env.js';

const SEED = new URL('../../../migrations/V2__seed.sql', import.meta.url);

/**
 * Puts the shared database back to exactly what `V2__seed.sql` describes:
 * truncate every application table, then run the seed again, self-check and all.
 *
 * Truncate-and-reseed rather than transaction rollback, because the backend owns
 * the transactions here — the test only has HTTP. It is slower, but a concurrency
 * test that fires 20 checkouts at TOTE-M needs to know TOTE-M holds exactly one.
 *
 * The table list is read from the catalogue rather than written out, so a table
 * added by V3 is reset without anyone remembering to add it here. Flyway's own
 * history is the one table left alone.
 */
export async function resetDatabase(): Promise<void> {
  const seed = await readFile(SEED, 'utf8');
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ name: string }>(
      `SELECT format('%I.%I', schemaname, tablename) AS name
         FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> 'flyway_schema_history'`,
    );
    await client.query('BEGIN');
    await client.query(`TRUNCATE ${rows.map((r) => r.name).join(', ')} RESTART IDENTITY CASCADE`);
    await client.query(seed);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
  await flushCache();
}

/**
 * Redis holds caches (the category tree carries product counts) and sweeper locks,
 * nothing else — so flushing it is always safe, and a missing Redis is not an error.
 */
async function flushCache(): Promise<void> {
  if (!REDIS_URL) return;
  const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  try {
    await redis.connect();
    await redis.flushdb();
  } catch {
    // Redis is optional by design; a backend without it is slower, never wrong.
  } finally {
    redis.disconnect();
  }
}
