/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
} from '@cqrs-ddd/pipeline';
import { describe, expect, it } from 'vitest';
import { Command, Query } from './classes.js';
import {
  CommandHandler,
  commandOf,
  EventsHandler,
  eventsOf,
  pipelineOf,
  QueryHandler,
  queryOf,
  SkipPipeline,
  UsePipeline,
} from './decorators.js';

class Audit implements IPipelineBehavior {
  async handle(_context: IPipelineContext, next: NextDelegate) {
    return next();
  }
}
class Trace implements IPipelineBehavior {
  async handle(_context: IPipelineContext, next: NextDelegate) {
    return next();
  }
}

class CreateUser extends Command<string> {}
class GetUser extends Query<string | null> {}
class UserCreated {}
class UserInvited {}

const standard = (name: string) =>
  ({ kind: 'class', name }) as ClassDecoratorContext;

describe('handler decorators', () => {
  it('record the request class of a command, query and events handler', () => {
    @CommandHandler(CreateUser)
    class CreateUserHandler {}
    @QueryHandler(GetUser)
    class GetUserHandler {}
    @EventsHandler(UserCreated, UserInvited)
    class Welcome {}

    expect(commandOf(CreateUserHandler)).toBe(CreateUser);
    expect(queryOf(GetUserHandler)).toBe(GetUser);
    expect(eventsOf(Welcome)).toEqual([UserCreated, UserInvited]);
    expect(commandOf(Welcome)).toBeUndefined();
    expect(queryOf(CreateUserHandler)).toBeUndefined();
    expect(eventsOf(GetUserHandler)).toBeUndefined();
  });

  it('work in the standard decorator mode, which passes a context', () => {
    class Handler {}
    CommandHandler(CreateUser)(Handler, standard('Handler'));
    expect(commandOf(Handler)).toBe(CreateUser);
  });

  it('are inherited by subclasses, which can redeclare them', () => {
    @CommandHandler(CreateUser)
    class Base {}
    class Child extends Base {}
    @QueryHandler(GetUser)
    class Other extends Base {}

    expect(commandOf(Child)).toBe(CreateUser);
    expect(queryOf(Other)).toBe(GetUser);
  });

  it('refuse a request that is not a class, and an events handler without events', () => {
    expect(() => CommandHandler('CreateUser' as never)).toThrow(
      '@CommandHandler takes a request class, received string.',
    );
    expect(() => QueryHandler(null as never)).toThrow(
      '@QueryHandler takes a request class, received null.',
    );
    expect(() => EventsHandler(UserCreated, {} as never)).toThrow(
      '@EventsHandler takes a request class, received object.',
    );
    expect(() => EventsHandler()).toThrow(
      '@EventsHandler takes at least one event class.',
    );
  });

  it('give typed command and query classes no runtime state', () => {
    expect(Object.keys(new CreateUser())).toEqual([]);
    expect(Object.keys(new GetUser())).toEqual([]);
  });
});

describe('@UsePipeline and @SkipPipeline', () => {
  it('record the entries, their options and the skipped behaviors', () => {
    @UsePipeline(Audit, [Trace, { tracerName: 'users' }])
    @SkipPipeline(Audit)
    @SkipPipeline(Trace)
    class Handler {}

    const declared = pipelineOf(Handler);
    expect(declared.types).toEqual([Audit, Trace]);
    expect(declared.options.get(Trace)).toEqual({ tracerName: 'users' });
    expect(declared.skipped).toEqual([Trace, Audit]);
  });

  it('declare nothing when a handler has neither', () => {
    class Plain {}
    expect(pipelineOf(Plain)).toEqual({
      types: [],
      options: new Map(),
      skipped: [],
    });
  });

  it('name the handler in errors, in both decorator modes', () => {
    class Legacy {}
    class Modern {}
    expect(() => UsePipeline({} as never)(Legacy)).toThrow(
      '@UsePipeline on Legacy, entry 0',
    );
    expect(() =>
      SkipPipeline([Audit, {}] as never)(Modern, standard('Renamed')),
    ).toThrow('@SkipPipeline on Renamed, entry 0');
  });
});
