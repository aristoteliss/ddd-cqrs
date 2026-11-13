/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * An HTTP answer for an error: status, JSON body and headers. The `http` entry point of
 * each pipeline package returns it from `toHttpResponse`; no package sends it.
 */
export interface HttpResponse {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}
