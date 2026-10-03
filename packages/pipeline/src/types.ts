/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** A class, as `new` accepts it. Behaviors, requests and handlers are identified by theirs. */
// biome-ignore lint/suspicious/noExplicitAny: constructor parameters are not known here
export type Constructor<T = unknown> = new (...args: any[]) => T;
