/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Journal, startDesk } from './app.js';
import { NotifyDesk } from './tickets.js';

describe.each(['express', 'fastify'] as const)(
  'the NestJS desk over HTTP on %s',
  (platform) => {
    let app: INestApplication;
    const http = () => request(app.getHttpServer());
    const open = (title = 'Printer jam') =>
      http().post('/tickets').send({ title });
    const close = (id: string, role?: string) => {
      const call = http().post(`/tickets/${id}/close`);
      return role ? call.set('x-role', role) : call;
    };

    beforeEach(async () => {
      app = await startDesk(platform);
    });

    afterEach(() => app.close());

    it("opens a ticket through its pipeline and publishes its event in the request's correlation", async () => {
      const response = await open()
        .set('x-correlation-id', 'corr-1')
        .expect(201);

      expect(response.body).toEqual({
        id: expect.any(String),
        title: 'Printer jam',
        status: 'open',
      });
      expect(response.headers['x-correlation-id']).toBe('corr-1');
      await vi.waitFor(() =>
        expect(app.get(NotifyDesk).sent).toEqual(['New ticket: Printer jam']),
      );
      expect(app.get(Journal).entries).toEqual([
        'command OpenTicketCommand corr-1',
        'event TicketOpenedEvent corr-1',
      ]);
    });

    it('gives a request without a correlation id a new one, echoed and seen by the pipeline', async () => {
      const response = await open().expect(201);

      const id = response.headers['x-correlation-id'];
      expect(id).toEqual(expect.any(String));
      expect(app.get(Journal).entries[0]).toBe(
        `command OpenTicketCommand ${id}`,
      );
    });

    it('reads a ticket through the query bus, and answers 404 for an unknown one', async () => {
      const { body: ticket } = await open().expect(201);

      await http().get(`/tickets/${ticket.id}`).expect(200, ticket);
      await http().get('/tickets/missing').expect(404, {
        statusCode: 404,
        error: 'Not Found',
        message: 'Ticket not found',
      });
    });

    it("answers an invalid body with NestJS's validation answer, before any handler runs", async () => {
      await open('ab').expect(400, {
        statusCode: 400,
        error: 'Bad Request',
        message: ['title: Too small: expected string to have >=3 characters'],
      });
      expect(app.get(Journal).entries).toEqual([]);
    });

    it('lets only a caller with the close capability close a ticket, once', async () => {
      const { body: ticket } = await open().expect(201);

      const denied = {
        statusCode: 403,
        error: 'Forbidden',
        action: 'close',
        subject: 'Ticket',
      };
      const { body: customer } = await close(ticket.id, 'customer').expect(403);
      expect(customer).toMatchObject(denied);
      const { body: anonymous } = await close(ticket.id).expect(403);
      expect(anonymous).toMatchObject(denied);

      await close(ticket.id, 'agent').expect(200, {
        ...ticket,
        status: 'closed',
      });
      await close(ticket.id, 'agent').expect(400, {
        statusCode: 400,
        error: 'Bad Request',
        message: `Ticket ${ticket.id} is already closed`,
      });
      await close('missing', 'agent').expect(404);
    });

    it('opens three tickets a minute, then answers 429 with Retry-After', async () => {
      for (let i = 0; i < 3; i += 1) await open().expect(201);

      const response = await open().expect(429);

      expect(response.body).toMatchObject({ statusCode: 429 });
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    });
  },
);
