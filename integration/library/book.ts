/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  ApplyMutation,
  DomainException,
  InvalidValueException,
  Mutable,
  numberRule,
  RootDomainEvent,
  RootEntity,
  type RootEntitySnapshot,
  textRule,
} from '@cqrs-ddd/core/domain';

export class InvalidTitleException extends InvalidValueException {}
export class InvalidCopiesException extends InvalidValueException {}

/** A loan the library cannot grant: every copy is out, or the member already holds one. */
export class LoanRefusedException extends DomainException {}

/** A return of a copy the member does not hold. */
export class NotOnLoanException extends DomainException {
  constructor(memberId: string) {
    super(`Member ${memberId} holds no copy of this book.`);
  }
}

export interface BookSnapshot extends Partial<RootEntitySnapshot> {
  readonly title: string;
  readonly copies: number;
  readonly borrowers?: readonly string[];
}

/**
 * A title in the library and who holds its copies. Every change goes through a domain
 * method, which checks the rule, writes only `@Mutable` fields and records one event.
 *
 * @example
 * ```ts
 * const book = Book.add('Dune', 2);
 * book.lend('m-1');
 * book.available; // 1
 * ```
 */
export class Book extends RootEntity<BookSnapshot> {
  static readonly aggregateName = 'book';
  static readonly rules = {
    title: textRule({
      field: 'title',
      minLength: 1,
      maxLength: 200,
      error: (violation) => new InvalidTitleException(violation),
    }),
    copies: numberRule({
      field: 'copies',
      integer: true,
      min: 1,
      max: 50,
      error: (violation) => new InvalidCopiesException(violation),
    }),
  } as const;

  readonly title: string;
  readonly copies: number;

  @Mutable<readonly string[]>()
  private _borrowers: readonly string[];

  private constructor(snapshot: BookSnapshot) {
    super(snapshot);
    this.title = Book.rules.title.parse(snapshot.title);
    this.copies = Book.rules.copies.parse(snapshot.copies);
    this._borrowers = [...(snapshot.borrowers ?? [])];
  }

  static add(title: string, copies: number): Book {
    const book = new Book({ title, copies });
    book.apply(new BookAddedEvent(book));
    return book;
  }

  static fromJSON(snapshot: BookSnapshot): Book {
    return new Book(snapshot);
  }

  get borrowers(): readonly string[] {
    return this._borrowers;
  }

  get available(): number {
    return this.copies - this._borrowers.length;
  }

  @ApplyMutation<Book>({ event: (book) => new BookLentEvent(book) })
  lend(memberId: string): this {
    if (this.available === 0) {
      throw new LoanRefusedException(`No copy of ${this.title} is available.`);
    }
    if (this._borrowers.includes(memberId)) {
      throw new LoanRefusedException(
        `Member ${memberId} already holds a copy.`,
      );
    }
    this.applyPatch({ borrowers: [...this._borrowers, memberId] });
    return this;
  }

  @ApplyMutation<Book>({ event: (book) => new BookReturnedEvent(book) })
  giveBack(memberId: string): this {
    if (!this._borrowers.includes(memberId)) {
      throw new NotOnLoanException(memberId);
    }
    this.applyPatch({
      borrowers: this._borrowers.filter((id) => id !== memberId),
    });
    return this;
  }

  toJSON(): BookSnapshot & RootEntitySnapshot {
    return this.freezeState({
      id: this.id,
      title: this.title,
      copies: this.copies,
      borrowers: this._borrowers,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version,
    });
  }
}

export class BookAddedEvent extends RootDomainEvent<Book, BookSnapshot> {
  constructor(book: Book) {
    super(book);
  }
}

export class BookLentEvent extends RootDomainEvent<Book, BookSnapshot> {
  constructor(book: Book) {
    super(book);
  }
}

export class BookReturnedEvent extends RootDomainEvent<Book, BookSnapshot> {
  constructor(book: Book) {
    super(book);
  }
}
