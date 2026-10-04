/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { getCorrelationId } from '../correlation.store.js';
import { httpCorrelation } from './http-correlation.middleware.js';

function fakeRequest(headers: Record<string, string> = {}): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

const fakeResponse = {} as ServerResponse;

describe('httpCorrelation', () => {
  it('extracts x-correlation-id header by default', () => {
    const middleware = httpCorrelation();
    const req = fakeRequest({ 'x-correlation-id': 'abc-123' });

    let captured: string | undefined;
    middleware(req, fakeResponse, () => {
      captured = getCorrelationId();
    });

    expect(captured).toBe('abc-123');
  });

  it('calls next when the header is missing', () => {
    const middleware = httpCorrelation();
    const req = fakeRequest({});
    const next = vi.fn();

    middleware(req, fakeResponse, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('uses a custom header name from options', () => {
    const middleware = httpCorrelation({
      header: 'x-request-id',
    });
    const req = fakeRequest({ 'x-request-id': 'custom-456' });

    let captured: string | undefined;
    middleware(req, fakeResponse, () => {
      captured = getCorrelationId();
    });

    expect(captured).toBe('custom-456');
  });

  it('normalizes a custom header name because Node request headers are lowercase', () => {
    const middleware = httpCorrelation({
      header: 'X-Request-ID',
    });
    const req = fakeRequest({ 'x-request-id': 'custom-456' });

    let captured: string | undefined;
    middleware(req, fakeResponse, () => {
      captured = getCorrelationId();
    });

    expect(captured).toBe('custom-456');
  });

  it('defaults to x-correlation-id when options has no header field', () => {
    const middleware = httpCorrelation({});
    const req = fakeRequest({ 'x-correlation-id': 'default-789' });

    let captured: string | undefined;
    middleware(req, fakeResponse, () => {
      captured = getCorrelationId();
    });

    expect(captured).toBe('default-789');
  });

  it.each(['', ' ', 'bad header', 'x-header\r\ninjected'])(
    'rejects invalid configured header name %j',
    (header) => {
      expect(() => httpCorrelation({ header })).toThrow(
        'Invalid correlation HTTP header name',
      );
    },
  );

  it('extracts the first value when header is an array of strings', () => {
    const middleware = httpCorrelation();
    const req = {
      headers: { 'x-correlation-id': ['first-id', 'second-id'] },
    } as unknown as IncomingMessage;

    let captured: string | undefined;
    middleware(req, fakeResponse, () => {
      captured = getCorrelationId();
    });

    expect(captured).toBe('first-id');
  });

  it('ignores empty whitespace-only headers when trimIncoming is true', () => {
    const middleware = httpCorrelation({ trimIncoming: true });
    const req = fakeRequest({ 'x-correlation-id': '   \t  ' });

    let captured: string | undefined;
    middleware(req, fakeResponse, () => {
      captured = getCorrelationId();
    });

    expect(captured).toBeDefined();
    expect(captured?.trim()).not.toBe('');
    expect(captured).not.toBe('   \t  ');
  });
});
