import Fastify from 'fastify';
import fetch from 'node-fetch';
import { env } from './core/env.js';
import { logger } from './core/logger.js';
import { fetchEmployees } from './cms/hrm-client.js';
import { syncUsersToAsi } from './users/sync-service.js';
import { startAlarmTcpServer } from "./alarms/tcp-listener";
startAlarmTcpServer(logger);

async function buildServer() {
  const app = Fastify({ logger });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async () => ({ status: 'ready' }));

  app.post('/cms/sync-employees', async (req, reply) => {
    const employees = await fetchEmployees();
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
