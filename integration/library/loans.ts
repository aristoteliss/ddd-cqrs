/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  BaseCommand,
  CommandBaseHandler,
  type IDomainEventPublisher,
  type IWriteSideAggregateRepository,
} from '@cqrs-ddd/core/application';
import {
  ConcurrencyConflictError,
  EntityNotFoundException,
  type IEvent,
} from '@cqrs-ddd/core/domain';
import { Book, type BookSnapshot } from './book.js';

/**
 * Books kept as snapshots in memory. A write succeeds only when the stored version is
 * the one the book was loaded at, as a database write conditioned on `version` would.
 *
 * @example
 * ```ts
 * const books = new BookShelf();
 * await books.save(Book.add('Dune', 2));
 * ```
 */
export class BookShelf implements IWriteSideAggregateRepository<Book> {
  readonly #rows = new Map<string, BookSnapshot & { version: number }>();

  async findById(id: string): Promise<Book | null> {
    const row = this.#rows.get(id);
    return row ? Book.fromJSON(row) : null;
  }

  async save(book: Book): Promise<BookSnapshot> {
    const stored = this.#rows.get(book.id);
    const expected = stored ? book.getExpectedVersion() : 0;
    if ((stored?.version ?? 0) !== expected) {
      throw new ConcurrencyConflictError(
        'Book',
        book.id,
        expected,
        stored?.version,
      );
    }
    const snapshot = book.toJSON();
    this.#rows.set(book.id, { ...snapshot, version: book.version });
    book.acknowledgePersisted();
    return snapshot;
  }
}

/** The publisher of the example: it keeps the events a notification service would send. */
export class EventLog implements IDomainEventPublisher {
  readonly events: IEvent[] = [];

  publishAll(events: IEvent[]): void {
    this.events.push(...events);
  }
}

export class AddBookCommand extends BaseCommand {
  constructor(
    readonly title: string,
    readonly copies: number,
  ) {
    super();
  }
}

export class LendBookCommand extends BaseCommand {
  constructor(
    readonly bookId: string,
    readonly memberId: string,
  ) {
    super();
  }
}

export class ReturnBookCommand extends BaseCommand {
  constructor(
    readonly bookId: string,
    readonly memberId: string,
  ) {
    super();
  }
}

/**
 * Adds a title; its `BookAddedEvent` is published once the book is stored.
 *
 * @example
 * ```ts
 * const book = await new AddBookHandler(books, log).execute(new AddBookCommand('Dune', 2));
 * ```
 */
export class AddBookHandler extends CommandBaseHandler<AddBookCommand, Book> {
  constructor(
    private readonly books: BookShelf,
    events: IDomainEventPublisher,
  ) {
    super(events);
  }

  async handle(command: AddBookCommand): Promise<Book> {
    const book = Book.add(command.title, command.copies);
    await this.books.save(book);
    return book;
  }
}

/**
 * Lends a copy to a member, or refuses; a refused loan publishes nothing.
 *
 * @example
 * ```ts
 * await new LendBookHandler(books, log).execute(new LendBookCommand(book.id, 'm-1'));
 * ```
 */
export class LendBookHandler extends CommandBaseHandler<LendBookCommand, Book> {
  constructor(
    private readonly books: BookShelf,
    events: IDomainEventPublisher,
  ) {
    super(events);
  }

  async handle(command: LendBookCommand): Promise<Book> {
    const book = await this.books.findById(command.bookId);
    if (!book) throw new EntityNotFoundException('Book', command.bookId);
    book.lend(command.memberId);
    await this.books.save(book);
    return book;
  }
}

/**
 * Takes a copy back from a member. It returns the book as `aggregate` of its result,
 * which `CommandBaseHandler` publishes the same way.
 *
 * @example
 * ```ts
 * const { available } = await new ReturnBookHandler(books, log).execute(
 *   new ReturnBookCommand(book.id, 'm-1'),
 * );
 * ```
 */
export class ReturnBookHandler extends CommandBaseHandler<
  ReturnBookCommand,
  { aggregate: Book; available: number }
> {
  constructor(
    private readonly books: BookShelf,
    events: IDomainEventPublisher,
  ) {
    super(events);
  }

  async handle(command: ReturnBookCommand) {
    const book = await this.books.findById(command.bookId);
    if (!book) throw new EntityNotFoundException('Book', command.bookId);
    book.giveBack(command.memberId);
    await this.books.save(book);
    return { aggregate: book, available: book.available };
  }
}
