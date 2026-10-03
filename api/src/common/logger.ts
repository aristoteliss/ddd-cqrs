/* Copyright (C) 2026-present Aristotelis — see repository license. */

import pino from 'pino';
import { HEADERS } from './constants/headers.constants.js';

/** Credential headers redacted from the request log lines. */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  `req.headers["${HEADERS.API_KEY}"]`,
  `req.headers["${HEADERS.API_ID}"]`,
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
];

const production = process.env.NODE_ENV === 'production';

/** The application's logger: JSON in production, pretty lines otherwise. */
export const logger = pino({
  level: production ? 'info' : 'debug',
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  ...(production
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
        },
      }),
});
