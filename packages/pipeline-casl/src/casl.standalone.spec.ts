/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createPipeline } from '@cqrs-ddd/pipeline';
import { describe, expect, it } from 'vitest';
import { CaslBehavior } from './casl.behavior.js';
import { UnauthorizedActionException } from './errors/unauthorized-action.exception.js';
import { requires } from './helpers/requires.js';
import { toHttpResponse } from './http.js';
import type { ICaslPermissionSource } from './interfaces/permission-source.interface.js';

const source: ICaslPermissionSource = {
  load: async () => ({
    principal: { id: 'ann' },
    rules: ['Post|read|*' as never],
  }),
};

describe('CaslBehavior on wrapped functions', () => {
  const pipeline = createPipeline({ behaviors: [new CaslBehavior(source)] });

  it('runs the function when every requirement passes', async () => {
    const readPost = pipeline.wrap(
      { name: 'readPost', kind: 'query' },
      requires({ action: 'read', subject: 'Post' }),
    )(async (id: string) => `post ${id}`);

    await expect(readPost('1')).resolves.toBe('post 1');
  });

  it('refuses a denied action, which maps to a 403 answer', async () => {
    const deletePost = pipeline.wrap(
      { name: 'deletePost', kind: 'command' },
      requires({ action: 'delete', subject: 'Post' }),
    )(async () => 'deleted');

    const error = await deletePost().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedActionException);
    expect(toHttpResponse(error as UnauthorizedActionException)).toEqual({
      status: 403,
      body: {
        statusCode: 403,
        error: 'Forbidden',
        message: (error as UnauthorizedActionException).message,
        action: 'delete',
        subject: 'Post',
      },
      headers: {},
    });
  });

  it('refuses a call-site declaration without rules', () => {
    const wrap = (entry: Parameters<typeof pipeline.wrap>[1]) =>
      pipeline.wrap(
        { name: 'unchecked', kind: 'command' },
        entry,
      )(async () => 'ran');

    expect(() => wrap(CaslBehavior)).toThrow('declared without rules');
    expect(() => wrap([CaslBehavior, {}])).toThrow('declared without rules');
    expect(() => wrap([CaslBehavior, { rules: [] }])).toThrow(
      'declared without rules',
    );
  });

  it('accepts a global declaration without rules, which passes through', async () => {
    const global = createPipeline({
      behaviors: [new CaslBehavior(source)],
      globalBehaviors: { before: [CaslBehavior] },
    });
    const open = global.wrap({ name: 'open', kind: 'query' })(async () => 'ok');

    await expect(open()).resolves.toBe('ok');
  });

  it('cannot be built without a permission source', () => {
    expect(() => new CaslBehavior(undefined as never)).toThrow(
      'CaslBehavior requires a permission source',
    );
    expect(() =>
      createPipeline({ globalBehaviors: { before: [CaslBehavior] } }),
    ).toThrow('CaslBehavior requires a permission source');
  });
});
