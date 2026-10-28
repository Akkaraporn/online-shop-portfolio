// Property-tests the running backend against contract/openapi.yaml.
//
// Schemathesis reads the spec, generates requests that are valid (and invalid) by
// its schemas, and checks every response against it: no 5xx, only declared status
// codes and content types, bodies that match their schema, invalid input rejected.
// It knows nothing about the backend beyond API_BASE_URL — same rule as the suite.
//
// It runs signed in as the seeded admin, so the admin operations are reached rather
// than stopping at 401. It mutates state freely; the database is reset afterwards.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loginAdmin } from '../src/actors.js';
import { API_BASE_URL } from '../src/env.js';
import { resetDatabase } from '../src/reset.js';

const SCHEMATHESIS_VERSION = '4.32.7';

const contract = fileURLToPath(new URL('../../../contract/openapi.yaml', import.meta.url));
const maxExamples = process.env.SCHEMATHESIS_MAX_EXAMPLES ?? '200';

await resetDatabase();
const admin = await loginAdmin();

// `uvx` runs a pinned Schemathesis without installing anything globally. Override
// with SCHEMATHESIS="schemathesis" where it is already on PATH (CI).
const [command, ...prefix] = (
  process.env.SCHEMATHESIS ?? `uvx schemathesis@${SCHEMATHESIS_VERSION}`
).split(' ');

const run = spawnSync(
  command,
  [
    ...prefix,
    'run',
    contract,
    '--url', API_BASE_URL,
    '--checks', 'all',
    // Demands 405 + Allow for an undeclared method. Settled differently: such a
    // method is a 404 `not-found` in both backends (docs/problem-types.md), and
    // nginx refuses TRACE before routing, when it cannot know what the path allows.
    '--exclude-checks', 'unsupported_method',
    // Contract rule 11: no string may hold U+0000 (PostgreSQL text cannot store it).
    // Stated once in the contract's conventions, not as a pattern on every string, so
    // the generator is told here; the backends' own tests assert the 422.
    '--generation-allow-x00', 'false',
    '--max-examples', maxExamples,
    '--header', `Authorization: Bearer ${admin.accessToken}`,
    '--generation-database', 'none',
    '--report', 'junit',
    '--report-dir', 'schemathesis-report',
    ...process.argv.slice(2),
  ],
  // UTF-8 forced: on a Thai-locale Windows console Python defaults to cp874, which
  // cannot encode Schemathesis' box-drawing header — or the Thai in our responses.
  { stdio: 'inherit', env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } },
);
if (run.error) throw run.error;

await resetDatabase();
process.exit(run.status ?? 1);
