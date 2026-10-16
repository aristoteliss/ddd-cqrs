/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createPipeline, logging } from '@cqrs-ddd/pipeline';
import { validated, ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

const pipeline = createPipeline({
  globalBehaviors: { before: [logging({ requestResponseLogLevel: 'none' })] },
});

const order = z.object({
  orderId: z.string().min(1),
  amount: z.number().positive(),
});

const createOrder = pipeline.wrap(
  { name: 'createOrder', kind: 'command' },
  validated(order),
)(async (input) => ({ id: input.orderId, status: 'created' }));

console.log(await createOrder({ orderId: 'ord_123', amount: 49.99 }));

try {
  await createOrder({ orderId: 'ord_bad', amount: -1 });
} catch (error) {
  if (!(error instanceof ZodValidationError)) throw error;
  console.log('Invalid order rejected before the function ran');
}
