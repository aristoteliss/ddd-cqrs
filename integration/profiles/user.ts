/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AggregateRoot, DomainEvent } from '@cqrs-ddd/core/domain';

export class UserRenamedEvent extends DomainEvent {
  constructor(
    readonly userId: string,
    readonly name: string,
  ) {
    super();
  }
}

/**
 * A user that changes its state only through the events it applies: `rename()` records
 * a `UserRenamedEvent`, and `onUserRenamedEvent` applies it.
 *
 * @example
 * ```ts
 * new User('u-1', 'Ann').rename('Anna').name; // 'Anna'
 * ```
 */
export class User extends AggregateRoot {
  #name: string;

  constructor(
    readonly id: string,
    name: string,
  ) {
    super();
    this.#name = name;
  }

  get name(): string {
    return this.#name;
  }

  rename(name: string): this {
    if (name !== this.#name) this.apply(new UserRenamedEvent(this.id, name));
    return this;
  }

  protected onUserRenamedEvent(event: UserRenamedEvent): void {
    this.#name = event.name;
  }
}
