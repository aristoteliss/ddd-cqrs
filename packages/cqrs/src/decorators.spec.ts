/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import {
  CommandHandler,
  commandOf,
  EventsHandler,
  eventsOf,
  QueryHandler,
  queryOf,
} from './decorators.js';

class CreateUser {}
class GetUser {}
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
});
