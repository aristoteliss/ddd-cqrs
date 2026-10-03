/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash, randomBytes } from 'node:crypto';
import { type IRefreshTokens } from '../application/ports/refresh-tokens.port.js';

export class NodeRefreshTokens implements IRefreshTokens {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
