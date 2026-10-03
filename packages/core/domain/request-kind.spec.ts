/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { BaseCommand } from '../application/base.command.js';
import { BaseQuery } from '../application/base.query.js';
import { DomainEvent } from './events/domain.event.js';
import { REQUEST_KIND } from './request-kind.js';

class RenameUserCommand extends BaseCommand {
  constructor(readonly name: string) {
    super();
  }
}
class GetUserQuery extends BaseQuery {
  constructor(readonly id: string) {
    super();
  }
}
class UserRenamedEvent extends DomainEvent {
  constructor(readonly name: string) {
    super();
  }
}

describe('request-kind brand', () => {
  it('uses the key that @cqrs-ddd/pipeline reads, shared through Symbol.for', () => {
    expect(REQUEST_KIND).toBe(Symbol.for('@cqrs-ddd/request-kind'));
  });

  it.each([
    [new RenameUserCommand('Ann'), 'command'],
    [new GetUserQuery('u1'), 'query'],
    [new UserRenamedEvent('Ann'), 'event'],
  ])('tells a pipeline the kind of %o', (request, kind) => {
    expect((request as unknown as Record<symbol, unknown>)[REQUEST_KIND]).toBe(
      kind,
    );
  });

  it('stays out of own properties and serialized payloads', () => {
    const command = new RenameUserCommand('Ann');

    expect(Object.getOwnPropertySymbols(command)).toEqual([]);
    expect(JSON.stringify(command)).toBe('{"name":"Ann"}');
    expect(JSON.stringify(new UserRenamedEvent('Bob'))).toContain(
      '"name":"Bob"',
    );
  });
});
