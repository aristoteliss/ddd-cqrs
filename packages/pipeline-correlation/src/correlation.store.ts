/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';
import { uuidv7 } from '@cqrs-ddd/uuidv7';
import { DEFAULT_CORRELATION_HEADER } from './constants/correlation.constants.js';
import { admit, isAccepted, isPortable } from './policy/correlation.policy.js';

const correlation = new AsyncLocalStorage<string | undefined>();

/**
 * The correlation id as a context source, for `createPipeline({ sources })`
 * of `@cqrs-ddd/pipeline` and the job context registration of
 * `@cqrs-ddd/pipeline-job-context`. Unlike {@link getCorrelationId}, `current()`
 * generates nothing: it returns `undefined` when no id is set, so a pipeline
 * generates one and runs with it, and {@link getCorrelationId} inside the
 * handler returns that id. `run(id, fn)` runs `fn` with `id`, or with no id when `id`
 * is not printable ASCII without surrounding spaces. `create()` makes a new id, the one
 * way this package, pipelines and jobs generate one. `accepts(id)` tells whether an id
 * received from outside, such as in a job payload, passes the rules
 * `configureCorrelation` sets: by default at most 128 characters matching
 * `DEFAULT_CORRELATION_ID_PATTERN`. It reports nothing to `onRejected`.
 *
 * @example
 * ```ts
 * createPipeline({ sources: { correlationId: correlationSource } });
 * ```
 */
export const correlationSource = {
  current: (): string | undefined => correlation.getStore(),
  run: <T>(value: string | undefined, fn: () => T): T =>
    correlation.run(isPortable(value) ? value : undefined, fn),
  create: (): string => uuidv7(),
  accepts: (id: string): boolean => isAccepted(id),
} as const;

/**
 * Run a callback within a correlation context.
 *
 * Use this in **non-HTTP entry points** (queue workers, message consumers,
 * WebSocket handlers, scheduled jobs) to propagate an external correlation ID
 * into everything the callback runs, wrapped operations included.
 *
 * When `correlationId` is missing, empty, not printable ASCII without surrounding
 * spaces, or, once `configureCorrelation` has been called, rejected by its rules, `fn`
 * runs with the id {@link getCorrelationId}
 * returns (the current one, or a new one from `correlationSource.create()`), so it always
 * runs with a correlation id. A rejected id is reported to `onRejected` with the source
 * `'runWithCorrelationId'`. A pipeline dispatched inside `fn` takes the id as its
 * `context.correlationId`.
 *
 * @example
 * ```ts
 * // BullMQ worker
 * new Worker('emails', (job) =>
 *   runWithCorrelationId(job.data.correlationId, () => sendEmail(job.data)),
 * );
 *
 * // RabbitMQ consumer (amqplib)
 * channel.consume('users', (message) =>
 *   runWithCorrelationId(message.properties.correlationId, () =>
 *     onUserCreated(JSON.parse(message.content.toString())),
 *   ),
 * );
 *
 * // Scheduled job: no incoming id, so a new one is made
 * setInterval(() => runWithCorrelationId(undefined, () => hourlySync()), 3_600_000);
 * ```
 *
 * @param correlationId - The correlation ID to propagate, as received from outside.
 * @param fn - The callback to execute within the correlation context.
 */
export function runWithCorrelationId<T>(
  correlationId: string | undefined,
  fn: () => T,
): T {
  return runWithIncoming(correlationId, 'runWithCorrelationId', fn);
}

/** Runs `fn` with `id` when the rules accept it, else with the current or a new id. */
export function runWithIncoming<T>(
  id: unknown,
  source: string,
  fn: () => T,
): T {
  return correlation.run(
    admit(id, source, 'unchecked') ?? getCorrelationId(),
    fn,
  );
}

/**
 * Read the current correlation ID.
 *
 * It is the correlation id set by {@link runWithCorrelationId}, the HTTP
 * middleware, or a running pipeline. Outside any, a new UUIDv7 is generated on
 * each call, so it always returns a string.
 *
 * @example
 * ```ts
 * import { getCorrelationId } from '@cqrs-ddd/pipeline-correlation';
 *
 * class EmailWorker {
 *   @WithCorrelation()
 *   async process(job: Job) {
 *     console.log(`Processing with correlation: ${getCorrelationId()}`);
 *     await sendEmail(job.data);
 *   }
 * }
 * ```
 */
export function getCorrelationId(): string {
  return correlation.getStore() || correlationSource.create();
}

/**
 * Utility type that adds a `correlationId` field to any data shape.
 *
 * Use it to type BullMQ job data, RabbitMQ payloads, Kafka messages, etc.
 * so that the correlation ID is part of the contract.
 *
 * @example
 * ```ts
 * interface WelcomeEmailJobData {
 *   userId: string;
 *   email: string;
 * }
 *
 * // Queue typed as Queue<WithCorrelationId<WelcomeEmailJobData>>
 * await queue.add('send', addCorrelationId({ userId, email }));
 * ```
 */
export type WithCorrelationId<T = Record<string, unknown>> = T & {
  correlationId: string;
};

/**
 * Stamp the current correlation ID onto a data object.
 *
 * This is the **producer-side** counterpart to {@link WithCorrelation}:
 * - `addCorrelationId(data)` → stamps the ID when **enqueuing** a job / publishing a message
 * - `@WithCorrelation()` → extracts the ID when **processing** the job / handling the message
 *
 * Both default to the `'correlationId'` key, so they work together out of the box.
 *
 * @throws {TypeError} If `data` is not a plain object.
 *
 * @example
 * ```ts
 * // Bull / BullMQ
 * await queue.add('send-email', addCorrelationId({ userId, email }));
 *
 * // RabbitMQ (ClientProxy)
 * this.client.emit('user.created', addCorrelationId(payload));
 *
 * // Kafka
 * await this.producer.send({
 *   topic: 'orders',
 *   messages: [{ value: JSON.stringify(addCorrelationId(order)) }],
 * });
 *
 * // PostgreSQL NOTIFY
 * await sql`SELECT pg_notify('events', ${JSON.stringify(addCorrelationId(data))})`;
 *
 * // ⚠️ Arrays must be wrapped — passing one directly throws:
 * // addCorrelationId([item1, item2]);           // ❌ TypeError
 * addCorrelationId({ items: [item1, item2] });   // ✅
 * ```
 *
 * @param data - The payload to enrich. Must be a plain object, **not** an array.
 *              A shallow copy is returned; the original is not mutated.
 * @returns A new object with `correlationId` added.
 */
export function addCorrelationId<T extends Record<string, unknown>>(
  data: T,
): WithCorrelationId<T> {
  const prototype =
    data !== null && typeof data === 'object'
      ? Object.getPrototypeOf(data)
      : undefined;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(
      'addCorrelationId(data) requires a plain object payload. ' +
        'Wrap arrays and class instances in a plain object first.',
    );
  }
  return { ...data, correlationId: getCorrelationId() };
}

/**
 * Return a headers object stamped with the current correlation ID.
 *
 * Use this for **header-based** transports (Kafka, NATS, gRPC metadata, HTTP)
 * where the correlation ID belongs in message headers / metadata — **not** in
 * the data payload.
 *
 * For transports without native headers (Bull/BullMQ, PostgreSQL NOTIFY), use
 * {@link addCorrelationId} instead.
 *
 * @param key - Header name. Defaults to `'x-correlation-id'`.
 * @returns `{ [key]: correlationId }` — spread into your transport's headers.
 *
 * @example
 * ```ts
 * // Kafka
 * await producer.send({
 *   topic: 'orders',
 *   messages: [{ value: JSON.stringify(order), headers: correlationHeaders() }],
 * });
 *
 * // RabbitMQ (amqplib) — AMQP has a first-class correlationId property:
 * channel.publish(exchange, key, buffer, { correlationId: getCorrelationId() });
 * // …or in headers:
 * channel.publish(exchange, key, buffer, { headers: correlationHeaders() });
 *
 * // NATS
 * const headers = nats.headers();
 * Object.entries(correlationHeaders()).forEach(([k, v]) => headers.set(k, v));
 * nc.publish(subject, payload, { headers });
 *
 * // HTTP (outgoing)
 * await fetch(url, { headers: { ...correlationHeaders(), 'content-type': 'application/json' } });
 * ```
 */
export function correlationHeaders(
  key = DEFAULT_CORRELATION_HEADER,
): Record<string, string> {
  return { [key]: getCorrelationId() };
}
