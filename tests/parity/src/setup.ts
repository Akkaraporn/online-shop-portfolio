import { beforeAll } from 'vitest';

import { resetDatabase } from './reset.js';

// Runs once per test file: each suite starts from the seed, whatever the last one did.
beforeAll(async () => {
  await resetDatabase();
}, 60_000);
