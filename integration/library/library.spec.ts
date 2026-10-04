/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  ConcurrencyConflictError,
  EntityNotFoundException,
} from '@cqrs-ddd/core/domain';
import { domainErrorHttpStatus } from '@cqrs-ddd/core/http';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  Book,
  BookAddedEvent,
  BookLentEvent,
  BookReturnedEvent,
  InvalidCopiesException,
  InvalidTitleException,
  LoanRefusedException,
  NotOnLoanException,
} from './book.js';
import {
  AddBookCommand,
  AddBookHandler,
  BookShelf,
  EventLog,
  LendBookCommand,
  LendBookHandler,
  ReturnBookCommand,
  ReturnBookHandler,
} from './loans.js';

let books: BookShelf;
let log: EventLog;
let add: AddBookHandler;
let lend: LendBookHandler;
let giveBack: ReturnBookHandler;

beforeEach(() => {
  books = new BookShelf();
  log = new EventLog();
  add = new AddBookHandler(books, log);
  lend = new LendBookHandler(books, log);
  giveBack = new ReturnBookHandler(books, log);
});

describe('the library domain alone', () => {
  it('lends and takes back copies, publishing one event per stored change', async () => {
    const book = await add.execute(new AddBookCommand('  Dune ', 2));
    await lend.execute(new LendBookCommand(book.id, 'm-1'));
    await lend.execute(new LendBookCommand(book.id, 'm-2'));
    const result = await giveBack.execute(
      new ReturnBookCommand(book.id, 'm-1'),
    );

    expect(book.title).toBe('Dune');
    expect(result.available).toBe(1);
    expect(log.events.map((event) => event.constructor)).toEqual([
      BookAddedEvent,
      BookLentEvent,
      BookLentEvent,
      BookReturnedEvent,
    ]);
    const returned = log.events.at(-1) as BookReturnedEvent;
    expect(returned.aggregateVersion).toBe(4);
    expect(returned.payload.borrowers).toEqual(['m-2']);
    expect(Object.isFrozen(returned.payload)).toBe(true);
    expect(await books.findById(book.id)).toMatchObject({
      version: 4,
      borrowers: ['m-2'],
    });
  });

  it('refuses a loan without publishing or storing anything', async () => {
    const book = await add.execute(new AddBookCommand('Solaris', 2));
    await lend.execute(new LendBookCommand(book.id, 'm-1'));
    await expect(
      lend.execute(new LendBookCommand(book.id, 'm-1')),
    ).rejects.toThrow('already holds a copy');
    await lend.execute(new LendBookCommand(book.id, 'm-2'));
    const published = log.events.length;

    await expect(
      lend.execute(new LendBookCommand(book.id, 'm-3')),
    ).rejects.toThrow('No copy of Solaris is available.');
    await expect(
      giveBack.execute(new ReturnBookCommand(book.id, 'm-3')),
    ).rejects.toBeInstanceOf(NotOnLoanException);

    expect(log.events).toHaveLength(published);
    expect(await books.findById(book.id)).toMatchObject({ version: 3 });
  });

  it('rejects invalid values with the violated rule', () => {
    expect(() => Book.add('', 1)).toThrow(InvalidTitleException);
    try {
      Book.add('Dune', 0);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCopiesException);
      expect((error as InvalidCopiesException).violation).toMatchObject({
        field: 'copies',
        limit: 1,
      });
    }
  });

  it('rejects a write from a copy loaded before another change', async () => {
    const book = await add.execute(new AddBookCommand('Ubik', 3));
    const stale = await books.findById(book.id);
    await lend.execute(new LendBookCommand(book.id, 'm-1'));

    stale?.lend('m-2');
    await expect(books.save(stale as Book)).rejects.toBeInstanceOf(
      ConcurrencyConflictError,
    );
  });

  it('maps its errors to HTTP statuses at the edge', async () => {
    await expect(
      giveBack.execute(new ReturnBookCommand('no-such-book', 'm-1')),
    ).rejects.toBeInstanceOf(EntityNotFoundException);
    const missing = lend.execute(new LendBookCommand('no-such-book', 'm-1'));
    await expect(missing).rejects.toBeInstanceOf(EntityNotFoundException);
    expect(domainErrorHttpStatus(await missing.catch((e) => e))).toMatchObject({
      statusCode: 404,
    });
    expect(
      domainErrorHttpStatus(new LoanRefusedException('No copy left.')),
    ).toMatchObject({ statusCode: 400 });
  });
});
