/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { z } from 'zod';
import { StartAuthCommand } from '../application/cqrs/commands/start-auth.command.js';

const { email, code } = StartAuthCommand.schema.shape;

/**
 * Login request body for `POST /auths/login`, with the field rules of {@link StartAuthCommand}.
 *
 * @example
 * `{ "email": "user@example.com", "code": "123456" }`
 */
export const LoginDtoSchema = z.object({ email, code });

export type LoginDto = z.infer<typeof LoginDtoSchema>;
