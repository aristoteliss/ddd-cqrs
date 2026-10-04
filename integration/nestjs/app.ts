/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ErrorFilter, PipelineModule } from '@cqrs-ddd/nestjs';
import { CorrelationMiddleware } from '@cqrs-ddd/nestjs/correlation';
import type {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
} from '@cqrs-ddd/pipeline';
import { type Capability, CaslBehavior } from '@cqrs-ddd/pipeline-casl';
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import { RateLimitBehavior } from '@cqrs-ddd/pipeline-rate-limit';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  type INestApplication,
  Inject,
  Injectable,
  type MiddlewareConsumer,
  Module,
  type NestMiddleware,
  type NestModule,
  Param,
  Post,
} from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import { CommandBus, CqrsModule, QueryBus } from '@nestjs/cqrs';
import { ExpressAdapter } from '@nestjs/platform-express';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import type { Ticket } from './ticket.js';
import {
  CloseTicketCommand,
  CloseTicketHandler,
  GetTicketHandler,
  GetTicketQuery,
  NotifyDesk,
  OpenTicketCommand,
  OpenTicketHandler,
  Tickets,
  type TicketView,
  view,
} from './tickets.js';

const roles = new AsyncLocalStorage<string | undefined>();

const capabilities = new Map<string | undefined, Capability[]>([
  ['agent', [{ action: 'manage', subject: 'all' }]],
  ['customer', [{ action: 'read', subject: 'Ticket' }]],
]);

/** Runs each request as the role its `x-role` header names, where an application authenticates. */
@Injectable()
class RoleMiddleware implements NestMiddleware {
  use(request: IncomingMessage, _response: ServerResponse, next: () => void) {
    roles.run(request.headers['x-role'] as string | undefined, next);
  }
}

/** Records every handler it runs around, with the correlation id of its pipeline. */
@Injectable()
export class Journal implements IPipelineBehavior {
  readonly entries: string[] = [];

  async handle(context: IPipelineContext, next: NextDelegate) {
    this.entries.push(
      `${context.requestKind} ${context.requestName} ${context.correlationId}`,
    );
    return next();
  }
}

@Controller('tickets')
class TicketsController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  @Post()
  async open(@Body() body: { title: string }): Promise<TicketView> {
    const ticket = await this.commandBus.execute<OpenTicketCommand, Ticket>(
      new OpenTicketCommand(body),
    );
    return view(ticket);
  }

  @Post(':id/close')
  @HttpCode(200)
  async close(@Param('id') id: string): Promise<TicketView> {
    const ticket = await this.commandBus.execute<CloseTicketCommand, Ticket>(
      new CloseTicketCommand(id),
    );
    return view(ticket);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<TicketView> {
    return this.queryBus.execute<GetTicketQuery, TicketView>(
      new GetTicketQuery(id),
    );
  }
}

/**
 * The support desk: `@nestjs/cqrs` handlers run through their pipelines by
 * `PipelineModule`, every package error answered by `ErrorFilter`, and each request
 * correlated by `CorrelationMiddleware`. Three tickets open a minute; closing one
 * takes the `close` capability.
 */
@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      sources: { correlationId: correlationSource },
      globalBehaviors: { before: [Journal] },
    }),
  ],
  controllers: [TicketsController],
  providers: [
    { provide: APP_FILTER, useClass: ErrorFilter },
    Journal,
    {
      provide: CaslBehavior,
      useFactory: () =>
        new CaslBehavior({
          load: async () => {
            const role = roles.getStore();
            const rules = capabilities.get(role);
            return role && rules ? { principal: { id: role }, rules } : null;
          },
        }),
    },
    {
      provide: RateLimitBehavior,
      useFactory: () =>
        new RateLimitBehavior(
          new RateLimiterMemory({ points: 3, duration: 60 }),
        ),
    },
    Tickets,
    OpenTicketHandler,
    CloseTicketHandler,
    GetTicketHandler,
    NotifyDesk,
  ],
})
export class DeskModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationMiddleware, RoleMiddleware)
      .forRoutes(TicketsController);
  }
}

/**
 * Starts the desk on Express or Fastify, initialized and ready for requests on its
 * HTTP server; the caller closes it.
 *
 * @example
 * ```ts
 * const app = await startDesk('fastify');
 * await request(app.getHttpServer()).post('/tickets').send({ title: 'Printer jam' });
 * await app.close();
 * ```
 */
export async function startDesk(
  platform: 'express' | 'fastify',
): Promise<INestApplication> {
  if (platform === 'express') {
    const app = await NestFactory.create(DeskModule, new ExpressAdapter(), {
      logger: false,
      abortOnError: false,
    });
    return app.init();
  }
  const app = await NestFactory.create<NestFastifyApplication>(
    DeskModule,
    new FastifyAdapter(),
    { logger: false, abortOnError: false },
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
