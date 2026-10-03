/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Session } from '@fastify/secure-session';
import type { SessionData } from '../types/session-principal.js';

export interface HttpExchange {
  readonly session?: Session<SessionData>;
  /** The Express response or Fastify reply of the request. */
  readonly response: object;
}

export const httpExchangeStore = new AsyncLocalStorage<HttpExchange>();
