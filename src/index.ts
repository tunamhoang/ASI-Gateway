import Fastify from 'fastify';
import fetch from 'node-fetch';
import { env } from './core/env.js';
import { logger } from './core/logger.js';
import { fetchEmployees } from './cms/hrm-client.js';
import { syncUsersToAsi } from './users/sync-service.js';
import { startAlarmTcpServer } from "./alarms/tcp-listener";
import {
  registerDevice,
  listDevices,
  updateDevice,
  removeDevice,
  refreshStatus,
} from './devices/device-service.js';
// cast logger to any to satisfy tcp-listener's Console-based signature
startAlarmTcpServer(logger as any);

async function buildServer() {
  // Fastify's type definitions expect either a boolean or a specific logger interface.
  // Our Pino logger is compatible at runtime but not structurally typed, so cast to any.
  const app = Fastify({ logger: logger as any });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async () => ({ status: 'ready' }));

  app.post('/cms/sync-employees', async (req, reply) => {
    const raw = await fetchEmployees();
    const employees = Array.isArray(raw) ? raw : [raw];
    if (!Array.isArray(raw)) {
      logger.warn({ raw }, 'fetchEmployees returned non-array data');
    }
    const users = await Promise.all(
      employees.map(async (e: any) => {
        let faceImageBase64 = e.FaceImageBase64;
        const faceUrl =
          e.FaceUrl ?? e.faceUrl ?? e.FaceImageUrl ?? e.faceImageUrl;
        if (!faceImageBase64 && faceUrl) {
          try {
            const res = await fetch(faceUrl);
            if (res.ok) {
              const buf = Buffer.from(await res.arrayBuffer());
              faceImageBase64 = buf.toString('base64');
            }
          } catch (err) {
            logger.warn({ err, faceUrl }, 'fetch face image failed');
          }
        }
        return {
          userId: (e.EmployeeID ?? e.userId).toString(),
          name: e.FullName ?? e.fullName,
          citizenIdNo: e.CitizenID ?? e.citizenIdNo,
          faceImageBase64,
        };
      })
    );
    try {
      await syncUsersToAsi(users);
    } catch (err) {
      logger.error({ err }, 'syncUsersToAsi failed');
      return reply.status(503).send({ status: 'error', message: 'service unavailable' });
    }
    reply.send({ status: 'ok', count: users.length });
  });

  const deviceSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      ip: { type: 'string' },
      port: { type: 'number' },
      username: { type: 'string' },
      password: { type: 'string' },
      https: { type: 'boolean' },
      lastSeenAt: { type: ['string', 'null'], format: 'date-time' },
      status: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  } as const;

  const deviceInputSchema = {
    type: 'object',
    required: ['name', 'ip', 'username', 'password'],
    properties: {
      name: { type: 'string' },
      ip: { type: 'string' },
      port: { type: 'number' },
      username: { type: 'string' },
      password: { type: 'string' },
      https: { type: 'boolean' },
    },
    additionalProperties: false,
  } as const;

  const deviceUpdateSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      ip: { type: 'string' },
      port: { type: 'number' },
      username: { type: 'string' },
      password: { type: 'string' },
      https: { type: 'boolean' },
    },
    additionalProperties: false,
  } as const;

  const idParamSchema = {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string' } },
  } as const;

  app.get(
    '/devices',
    {
      schema: { response: { 200: { type: 'array', items: deviceSchema } } },
    },
    async (_req, reply) => {
      try {
        const devices = await listDevices();
        return devices;
      } catch (err) {
        reply.status(500).send({ message: 'failed to list devices' });
      }
    },
  );

  app.post(
    '/devices',
    { schema: { body: deviceInputSchema, response: { 201: deviceSchema } } },
    async (req, reply) => {
      try {
        const device = await registerDevice(req.body as any);
        reply.code(201).send(device);
      } catch (err) {
        reply.status(500).send({ message: 'failed to register device' });
      }
    },
  );

  app.patch(
    '/devices/:id',
    { schema: { params: idParamSchema, body: deviceUpdateSchema } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const device = await updateDevice(id, req.body as any);
        reply.send(device);
      } catch (err) {
        reply.status(404).send({ message: 'device not found' });
      }
    },
  );

  app.delete(
    '/devices/:id',
    { schema: { params: idParamSchema } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        await removeDevice(id);
        reply.status(204).send();
      } catch (err) {
        reply.status(404).send({ message: 'device not found' });
      }
    },
  );

  app.post(
    '/devices/:id/test-connection',
    { schema: { params: idParamSchema } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const device = await refreshStatus(id);
        if (!device) {
          reply.status(404).send({ message: 'device not found' });
          return;
        }
        reply.send({ status: device.status });
      } catch (err) {
        reply.status(500).send({ message: 'failed to test connection' });
      }
    },
  );
  return app;
}

async function start() {
  const app = await buildServer();
  try {
    await app.listen({ port: env.port, host: env.host });
    logger.info(`Server listening on http://${env.host}:${env.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { buildServer };
