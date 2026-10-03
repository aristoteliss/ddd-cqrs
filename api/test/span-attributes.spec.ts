/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type CommandBus,
  CommandHandler,
  type Cqrs,
  createCqrs,
  type ICommandHandler,
  UsePipeline,
} from '@cqrs-ddd/cqrs';
import {
  DeadLetterBehavior,
  type DeadLetterRecord,
} from '@cqrs-ddd/pipeline-deadletter';
import {
  createFeatureFlagClient,
  FeatureFlagBehavior,
  featureFlag,
} from '@cqrs-ddd/pipeline-feature-flags';
import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { trace } from '@opentelemetry/api';
import { tracing } from '@opentelemetry/sdk-node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GLOBAL_BEHAVIORS } from '../src/app.js';
import { DEAD_LETTER_DEFAULTS } from '../src/common/dead-letter/dead-letter.options.js';

class ProbeCommand {
  constructor(readonly fail: boolean) {}
}

@CommandHandler(ProbeCommand)
@UsePipeline(featureFlag({ flag: 'probe' }))
class ProbeHandler implements ICommandHandler<ProbeCommand> {
  async execute({ fail }: ProbeCommand): Promise<string> {
    if (fail) throw new Error('processor failed');
    return 'done';
  }
}

describe('the span attributes of the application behaviors', () => {
  const exporter = new tracing.InMemorySpanExporter();
  const records: DeadLetterRecord[] = [];
  let app: Cqrs;
  let bus: CommandBus;

  const probeSpan = () => {
    const spans = exporter
      .getFinishedSpans()
      .filter((span) => span.name === 'command.ProbeCommand');
    expect(spans).toHaveLength(1);
    return spans[0].attributes;
  };

  beforeAll(async () => {
    trace.setGlobalTracerProvider(
      new tracing.BasicTracerProvider({
        spanProcessors: [new tracing.SimpleSpanProcessor(exporter)],
      }),
    );
    const silent = { log() {}, warn() {}, error() {} };
    app = createCqrs({
      logger: silent,
      bootstrapLogLevel: 'none',
      globalBehaviors: GLOBAL_BEHAVIORS,
      behaviors: [
        new DeadLetterBehavior(
          { send: async (record) => void records.push(record) },
          DEAD_LETTER_DEFAULTS,
          silent,
        ),
        new FeatureFlagBehavior(
          await createFeatureFlagClient({
            domain: 'span-attributes-spec',
            provider: new TypedInMemoryProvider({
              probe: {
                disabled: false,
                variants: { on: true, off: false },
                defaultVariant: 'on',
              },
            }),
          }),
        ),
      ],
    });
    app.register(new ProbeHandler());
    bus = app.commandBus;
  });

  afterAll(async () => {
    await app.close();
    trace.disable();
  });

  beforeEach(() => {
    exporter.reset();
    records.length = 0;
  });

  it('records the decisions of the behaviors that ran, and none for those that did not', async () => {
    await expect(bus.execute(new ProbeCommand(false))).resolves.toBe('done');

    const attributes = probeSpan();
    expect(attributes).toMatchObject({
      'feature_flag.key': 'probe',
      'feature_flag.enabled': true,
      'feature_flag.variant': 'on',
    });
    expect(attributes).not.toHaveProperty('cache.hit');
    expect(attributes).not.toHaveProperty('idempotency.replayed');
    expect(attributes).not.toHaveProperty('dead_letter.captured');
  });

  it('records a dead-letter capture on the span of the failed command', async () => {
    await expect(bus.execute(new ProbeCommand(true))).rejects.toThrow(
      'processor failed',
    );

    expect(records).toHaveLength(1);
    expect(probeSpan()).toMatchObject({
      'dead_letter.captured': true,
      'pipeline.outcome': 'failure',
    });
  });
});
