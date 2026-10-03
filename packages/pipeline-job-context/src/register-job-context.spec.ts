/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { MissingJobContextError } from './errors/missing-job-context.error.js';
import { activeRegistration } from './helpers/registration.js';
import type { JobContextSources } from './interfaces/context-source.interface.js';
import type { IJobPrincipal } from './interfaces/job-principal.interface.js';
import { registerJobContext } from './register-job-context.js';

const principal = {} as IJobPrincipal;
const sources = {} as JobContextSources;

describe('registerJobContext', () => {
  it('makes the job context active until its unregister function runs', () => {
    const tenants = ['acme'];
    const unregister = registerJobContext({ principal, tenants, sources });
    tenants.push('globex');

    expect(activeRegistration()).toEqual({
      principal,
      tenants: ['acme'],
      sources,
    });
    unregister();
    expect(() => activeRegistration()).toThrow(MissingJobContextError);
  });

  it('refuses an empty tenant list', () => {
    expect(() =>
      registerJobContext({ principal, tenants: [], sources }),
    ).toThrow('needs at least one tenant');
  });
});
