/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Integration coverage for `CacheBehavior` inside a real pipeline. These tests
 * assert the two properties a mocked store cannot show: a repeated request by
 * the same principal is served from the store, and a different principal's is
 * not.
 */

import {
  type Cqrs,
  createCqrs,
  type IQueryHandler,
  type QueryBus,
  QueryHandler,
} from '@cqrs-ddd/cqrs';
import type {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
} from '@cqrs-ddd/pipeline';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import {
  buildCache,
  CacheBehavior,
  createPartitionedCacheKeyFactory,
  MissingCachePartitionError,
} from '@cqrs-ddd/pipeline-cache';
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import { runWithTenant, tenantSource } from '@cqrs-ddd/pipeline-tenant';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** Stands in for whatever an authentication behavior resolves per request. */
let currentPrincipal: string | undefined = 'alice';
let currentTenant: string | undefined = 'tenant-a';

/** Copies the ambient principal onto the pipeline context, as a real auth behavior would. */
class PrincipalBehavior implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate) {
    context.items.set('principal', currentPrincipal);
    return next();
  }
}

class GetReportQuery {
  constructor(readonly reportId: string) {}
}

const partitionedKey = createPartitionedCacheKeyFactory({
  principal: (ctx) => ctx.items.get('principal') as string | undefined,
  requireScope: false,
});

@QueryHandler(GetReportQuery)
@UsePipeline(PrincipalBehavior, [CacheBehavior, { key: partitionedKey }])
class GetReportHandler implements IQueryHandler<GetReportQuery, unknown> {
  static executions = 0;

  async execute(query: GetReportQuery) {
    GetReportHandler.executions += 1;
    return { reportId: query.reportId, visibleTo: currentPrincipal };
  }
}

describe('CacheBehavior partitioning in a real pipeline', () => {
  let app: Cqrs;
  let queries: QueryBus;

  beforeEach(async () => {
    currentPrincipal = 'alice';
    currentTenant = 'tenant-a';
    GetReportHandler.executions = 0;

    // A store per test: a shared one would turn the first lookup of a later test into a hit.
    app = createCqrs({
      bootstrapLogLevel: 'none',
      sources: { tenantId: tenantSource, correlationId: correlationSource },
      behaviors: [
        new CacheBehavior(
          buildCache({ store: { type: 'memory' }, ttl: 60_000 }),
        ),
      ],
    });
    app.register(new GetReportHandler());
    const bus = app.queryBus;
    queries = {
      execute: (query: Parameters<QueryBus['execute']>[0]) =>
        runWithTenant(currentTenant, () => bus.execute(query)),
    } as QueryBus;
  });

  afterEach(async () => {
    await app?.close();
  });

  it('serves a repeated request by the same principal from the store', async () => {
    const first = await queries.execute(new GetReportQuery('r-1'));
    const second = await queries.execute(new GetReportQuery('r-1'));

    expect(first).toEqual({ reportId: 'r-1', visibleTo: 'alice' });
    expect(second).toEqual(first);
    expect(GetReportHandler.executions).toBe(1);
  });

  it('does not serve one principal the response computed for another', async () => {
    const asAlice = await queries.execute(new GetReportQuery('r-1'));

    currentPrincipal = 'bob';
    const asBob = await queries.execute(new GetReportQuery('r-1'));

    expect(asAlice).toEqual({ reportId: 'r-1', visibleTo: 'alice' });
    expect(asBob).toEqual({ reportId: 'r-1', visibleTo: 'bob' });
    expect(GetReportHandler.executions).toBe(2);
  });

  it('separates tenants that share a principal identifier', async () => {
    await queries.execute(new GetReportQuery('r-1'));

    currentTenant = 'tenant-b';
    await queries.execute(new GetReportQuery('r-1'));

    expect(GetReportHandler.executions).toBe(2);
  });

  it('separates distinct payloads for the same principal', async () => {
    await queries.execute(new GetReportQuery('r-1'));
    await queries.execute(new GetReportQuery('r-2'));

    expect(GetReportHandler.executions).toBe(2);
  });

  it('fails closed when the principal cannot be resolved', async () => {
    currentPrincipal = undefined;

    await expect(queries.execute(new GetReportQuery('r-1'))).rejects.toThrow(
      MissingCachePartitionError,
    );
    // A hit would have skipped the handler and the entity-level authorization it
    // performs, so refusing to build the key is the only safe outcome.
    expect(GetReportHandler.executions).toBe(0);
  });
});
