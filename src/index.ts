import Fastify from 'fastify';
import { env } from './core/env.js';
import { logger } from './core/logger.js';

async function buildServer() {
  const app = Fastify({ logger });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async () => ({ status: 'ready' }));

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
