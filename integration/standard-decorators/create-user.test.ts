/* Copyright (C) 2026-present Aristotelis — see repository license. */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./create-user.mjs', import.meta.url));
const code = readFileSync(
  new URL('../create-user.mts', import.meta.url),
  'utf8',
).replace(/^\/\*.*\*\/\n\n/, '');
const pages = [
  'docs/src/content/docs/packages/cqrs.md',
  'docs/src/content/docs/el/packages/cqrs.md',
];

describe('the first CQRS example of the documentation', () => {
  it('creates a user, runs the event handler and rejects an invalid email', () => {
    const run = spawnSync(process.execPath, [script], { encoding: 'utf8' });

    assert.equal(run.status, 0);
    assert.match(
      run.stdout,
      /Welcome, ada@example\.com\nCreated user_1\nInvalid email rejected before the handler ran\n$/,
    );
  });

  for (const page of pages) {
    it(`is shown unchanged in ${page}`, () => {
      const text = readFileSync(
        new URL(`../../../${page}`, import.meta.url),
        'utf8',
      );

      assert.ok(text.includes(`\`\`\`ts\n${code}\`\`\``));
    });
  }
});
