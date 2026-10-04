/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AggregateRoot, DomainEvent } from '@cqrs-ddd/core/domain';

export class MemberRenamedEvent extends DomainEvent {
  constructor(
    readonly memberId: string,
    readonly name: string,
  ) {
    super();
  }
}

/**
 * A club member whose name changes through the event it applies.
 *
 * @example
 * ```ts
 * new Member('m-1', 'Ann').rename('Anna').getUncommittedEvents(); // [MemberRenamedEvent]
 * ```
 */
export class Member extends AggregateRoot {
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
    this.apply(new MemberRenamedEvent(this.id, name));
    return this;
  }

  protected onMemberRenamedEvent(event: MemberRenamedEvent): void {
    this.#name = event.name;
  }
}
