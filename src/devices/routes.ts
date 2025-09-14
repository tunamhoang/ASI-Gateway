import { FastifyInstance } from 'fastify';
import { registerDevice, listDevices, updateDevice, removeDevice, getDevice, pingDevice } from './device-service.js';

export async function deviceRoutes(app: FastifyInstance) {
  app.get('/devices', async () => {
    return listDevices();
  });

  app.post(
    '/devices',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'ip', 'username', 'password'],
          properties: {
            name: { type: 'string' },
            ip: { type: 'string' },
            port: { type: 'integer' },
            username: { type: 'string' },
            password: { type: 'string' },
            https: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const device = await registerDevice(req.body as any);
      reply.code(201).send(device);
    },
  );

  app.patch('/devices/:id', async (req, reply) => {
    const { id } = req.params as any;
    const device = await updateDevice(id, req.body as any);
    reply.send(device);
  });

  app.delete('/devices/:id', async (req, reply) => {
    const { id } = req.params as any;
    await removeDevice(id);
    reply.code(204).send();
  });

  app.post('/devices/:id/test-connection', async (req, reply) => {
    const { id } = req.params as any;
    const device = await getDevice(id);
    if (!device) {
      return reply.code(404).send({ message: 'device not found' });
    }
    const ok = await pingDevice(device as any);
    reply.send({ ok });
  });
}
