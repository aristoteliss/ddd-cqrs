/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { readFileSync } from 'node:fs';
import { ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CommandBus } from '@nestjs/cqrs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CreateInvoiceCommand, AppModule } from './invoices.js';

describe('the minimal NestJS setup of the documentation', () => {
  let app: INestApplicationContext;
  const create = (customer: string, amount: number) =>
    app.get(CommandBus).execute(new CreateInvoiceCommand(customer, amount));

  beforeEach(async () => {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
  });

  afterEach(() => app.close());

  it('runs a command of the official bus through its pipeline', async () => {
    await expect(create('acme', 120)).resolves.toEqual({
      customer: 'acme',
      amount: 120,
    });
  });

  it('rejects an invalid command before the handler runs', async () => {
    await expect(create('', -1)).rejects.toBeInstanceOf(ZodValidationError);
  });

  it.each([
    'docs/src/content/docs/packages/nestjs.md',
    'docs/src/content/docs/el/packages/nestjs.md',
  ])('is shown unchanged in %s', (page) => {
    const code = readFileSync(
      new URL('./invoices.ts', import.meta.url),
      'utf8',
    ).replace(/^\/\*.*\*\/\n\n/, '');

    expect(
      readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8'),
    ).toContain(`\`\`\`typescript\n${code}\`\`\``);
  });
});
