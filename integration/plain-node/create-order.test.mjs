/* Copyright (C) 2026-present Aristotelis — see repository license. */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./create-order.mjs', import.meta.url));
const source = readFileSync(script, 'utf8');
const code = source.replace(/^\/\*.*\*\/\n\n/, '');
const pages = [
  '../../README.md',
  '../../docs/src/content/docs/getting-started.md',
  '../../docs/src/content/docs/el/getting-started.md',
];

describe('the first example of the documentation', () => {
  it('creates a valid order and rejects an invalid one', () => {
    const run = spawnSync(process.execPath, [script], { encoding: 'utf8' });

    assert.equal(run.status, 0);
    assert.match(run.stdout, /\{ id: 'ord_123', status: 'created' \}/);
    assert.match(run.stdout, /Invalid order rejected before the function ran/);
    assert.match(run.stderr, /createOrder failed after .+ZodValidationError/);
  });

  it('is the file the demo directory runs', () => {
    const demo = new URL('../../demo/create-order.mjs', import.meta.url);

    assert.equal(readFileSync(demo, 'utf8'), source);
  });

  for (const page of pages) {
    it(`is shown unchanged in ${page.replace('../../', '')}`, () => {
      const text = readFileSync(new URL(page, import.meta.url), 'utf8');

      assert.ok(text.includes(`\`\`\`js\n${code}\`\`\``));
    });
  }
});
