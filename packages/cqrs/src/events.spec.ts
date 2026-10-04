/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestType } from './decorators.js';
import { EventBus, type EventSubscriber } from './event.bus.js';
import type { UnhandledExceptionInfo } from './interfaces.js';
import { UnhandledExceptionBus } from './unhandled-exception.bus.js';

class UserCreated {
  constructor(readonly id: string) {}
}
class AdminCreated extends UserCreated {}
class UserDeleted {}

const trail: string[] = [];

function subscriber(
  name: string,
  run: (event: unknown) => Promise<unknown> = async (event) => {
    trail.push(`${name} ${(event as UserCreated).id}`);
  },
): EventSubscriber {
  return { name, run };
}

function setup(
  entries: [RequestType, EventSubscriber[]][] = [],
  options: ConstructorParameters<typeof EventBus>[2] = {},
) {
  const handlers = new Map(entries);
  const unhandled = new UnhandledExceptionBus();
  const failures: UnhandledExceptionInfo[] = [];
  unhandled.subscribe((info) => failures.push(info));
  const bus = new EventBus(handlers, unhandled, options);
  return { bus, handlers, unhandled, failures };
}

afterEach(() => {
  trail.length = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('EventBus', () => {
  it('starts every handler of the event synchronously and returns without awaiting them', async () => {
    let release = () => {};
    const { bus } = setup([
      [
        UserCreated,
        [
          subscriber('Welcome', async (event) => {
            trail.push(`welcome ${(event as UserCreated).id}`);
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            trail.push('welcomed');
          }),
          subscriber('Index'),
        ],
      ],
    ]);

    expect(bus.publish(new UserCreated('u-1'))).toBeUndefined();
    expect(trail).toEqual(['welcome u-1', 'Index u-1']);

    const drained = bus.drain();
    release();
    await drained;
    expect(trail).toEqual(['welcome u-1', 'Index u-1', 'welcomed']);
  });

  it("uses the nearest parent class's handlers, drops an event without any, and reads handlers added later", async () => {
    const { bus, handlers } = setup([[UserCreated, [subscriber('Welcome')]]]);
    bus.publish(new AdminCreated('a-1'));
    bus.publish(new UserDeleted());
    handlers.set(AdminCreated, [subscriber('Grant')]);
    bus.publish(new AdminCreated('a-2'));
    await bus.drain();
    expect(trail).toEqual(['Welcome a-1', 'Grant a-2']);
  });

  it('publishes a list of events in order', async () => {
    const { bus } = setup([[UserCreated, [subscriber('Welcome')]]]);
    bus.publishAll([new UserCreated('u-1'), new UserCreated('u-2')]);
    await bus.drain();
    expect(trail).toEqual(['Welcome u-1', 'Welcome u-2']);
  });

  it('drains handlers that running handlers start', async () => {
    const { bus } = setup([
      [
        UserCreated,
        [
          subscriber('Cascade', async () => {
            await Promise.resolve();
            bus.publish(new UserDeleted());
          }),
        ],
      ],
      [
        UserDeleted,
        [
          subscriber('Purge', async () => {
            await Promise.resolve();
            trail.push('purged');
          }),
        ],
      ],
    ]);
    bus.publish(new UserCreated('u-1'));
    await bus.drain();
    expect(trail).toEqual(['purged']);
  });

  it('hands a failure to the UnhandledExceptionBus and the logger, never to the caller', async () => {
    const error = vi.fn();
    const failure = new Error('smtp down');
    const { bus, failures } = setup(
      [
        [
          UserCreated,
          [
            subscriber('Welcome', async () => {
              throw failure;
            }),
            subscriber('Index'),
          ],
        ],
      ],
      { logger: { log: vi.fn(), warn: vi.fn(), error } },
    );
    const event = new UserCreated('u-1');
    bus.publish(event);
    await bus.drain();

    expect(trail).toEqual(['Index u-1']);
    expect(failures).toEqual([{ cause: event, exception: failure }]);
    expect(error).toHaveBeenCalledWith(
      '"Welcome" has thrown an unhandled exception.',
      failure,
    );
  });

  it('logs to the console by default', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { bus } = setup([
      [UserCreated, [subscriber('Welcome', () => Promise.reject('down'))]],
    ]);
    bus.publish(new UserCreated('u-1'));
    await bus.drain();
    expect(error).toHaveBeenCalledWith(
      '"Welcome" has thrown an unhandled exception.',
      'down',
    );
  });

  it('throws a failure as an uncaught exception with rethrowUnhandled', async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, 'error');
    const failure = new Error('smtp down');
    const { bus, failures } = setup(
      [[UserCreated, [subscriber('Welcome', () => Promise.reject(failure))]]],
      { rethrowUnhandled: true },
    );
    bus.publish(new UserCreated('u-1'));
    await bus.drain();

    expect(() => vi.runAllTimers()).toThrow(failure);
    expect(failures).toEqual([]);
    expect(error).not.toHaveBeenCalled();
  });
});

describe('UnhandledExceptionBus', () => {
  it('delivers to each subscription until it ends, the same listener once per subscription', () => {
    const bus = new UnhandledExceptionBus();
    const seen: unknown[] = [];
    const listener = (info: UnhandledExceptionInfo) =>
      seen.push(info.exception);
    const first = bus.subscribe(listener);
    bus.subscribe(listener);

    bus.publish({ cause: new UserDeleted(), exception: 'a' });
    first.unsubscribe();
    bus.publish({ cause: new UserDeleted(), exception: 'b' });
    expect(seen).toEqual(['a', 'a', 'b']);
  });

  it('keeps delivering past a listener that throws, and throws its error on a later tick', () => {
    vi.useFakeTimers();
    const bus = new UnhandledExceptionBus();
    const broken = new Error('listener broke');
    const seen: unknown[] = [];
    bus.subscribe(() => {
      throw broken;
    });
    bus.subscribe((info) => seen.push(info.exception));

    bus.publish({ cause: new UserDeleted(), exception: 'a' });
    expect(seen).toEqual(['a']);
    expect(() => vi.runAllTimers()).toThrow(broken);
  });
});
