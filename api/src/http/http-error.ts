/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * An error the API answers with its status and `{ statusCode, message, error }`, for the
 * request failures of the application itself, such as a missing tenant header.
 *
 * @example
 * ```ts
 * throw new HttpError(403, 'Tenant context is required to process this request.');
 * ```
 */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
