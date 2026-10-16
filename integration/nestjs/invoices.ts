/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ErrorFilter, PipelineModule } from '@cqrs-ddd/nestjs';
import { LoggingBehavior, logging, UsePipeline } from '@cqrs-ddd/pipeline';
import { validated, ZodValidationBehavior } from '@cqrs-ddd/pipeline-zod';
import { Logger, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CommandHandler, CqrsModule, type ICommandHandler } from '@nestjs/cqrs';
import { z } from 'zod';

export class CreateInvoiceCommand {
  constructor(
    readonly customer: string,
    readonly amount: number,
  ) {}
}

@CommandHandler(CreateInvoiceCommand)
@UsePipeline(
  validated(
    z.object({ customer: z.string().min(1), amount: z.number().positive() }),
  ),
)
export class CreateInvoiceHandler
  implements ICommandHandler<CreateInvoiceCommand>
{
  async execute(command: CreateInvoiceCommand) {
    return { customer: command.customer, amount: command.amount };
  }
}

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({ globalBehaviors: { before: [logging()] } }),
  ],
  providers: [
    { provide: APP_FILTER, useClass: ErrorFilter },
    {
      provide: LoggingBehavior,
      useFactory: () => new LoggingBehavior(new Logger('Pipeline')),
    },
    ZodValidationBehavior,
    CreateInvoiceHandler,
  ],
})
export class AppModule {}
