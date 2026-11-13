/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { UnauthorizedActionException } from '@cqrs-ddd/pipeline-casl';

/**
 * The answer body of a write route: what `read` returns, or `{}` when the caller may
 * not read what it wrote or the record is gone. Every other error of `read` rejects.
 *
 * @param read - Reads the written record as the caller, such as a query on the bus.
 *
 * @example
 * ```ts
 * const { id } = await commandBus.execute(new CreateRoleCommand(body));
 * return readAfterWrite(() => find(id));
 * ```
 */
export async function readAfterWrite<T extends object>(
  read: () => Promise<T | null | undefined>,
): Promise<T | Record<string, never>> {
  try {
    return (await read()) ?? {};
  } catch (error) {
    if (error instanceof UnauthorizedActionException) return {};
    throw error;
  }
}
