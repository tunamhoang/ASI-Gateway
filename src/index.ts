import Fastify from 'fastify';
import { env } from './core/env.js';
import { logger } from './core/logger.js';
import { fetchEmployees } from './cms/hrm-client.js';
import { syncUsersToAsi } from './users/sync-service.js';

async function buildServer() {
  const app = Fastify({ logger });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async () => ({ status: 'ready' }));

  app.post('/cms/sync-employees', async (req, reply) => {
    const employees = await fetchEmployees();
    const users = employees.map((e: any) => ({
      userId: (e.EmployeeID ?? e.userId).toString(),
      name: e.FullName ?? e.fullName,
      citizenIdNo: e.CitizenID ?? e.citizenIdNo,
      faceImageBase64: e.FaceImageBase64,
    }));
    await syncUsersToAsi(users);
    reply.send({ status: 'ok', count: users.length });
  });
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
