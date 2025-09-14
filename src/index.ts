import Fastify from 'fastify';
import { env } from './core/env.js';
import { logger } from './core/logger.js';
import { fetchEmployees } from './cms/hrm-client.js';
import { syncUsersToAsi } from './users/sync-service.js';
import { startAlarmTcpServer } from "./alarms/tcp-listener.js";
import { deviceRoutes } from './devices/routes.js';
import pLimit from 'p-limit';
import { hmacSign } from './core/hmac.js';
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
const httpLimit = pLimit(5);             // bắt đầu 3–5; tăng dần nếu ổn
const CHUNK = 50;                        // xử lý theo lô để tránh spike

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
// ví dụ:
for (const batch of chunk(faceUsers, CHUNK)) {
  await Promise.all(
    batch.map(u => httpLimit(() => pushFaceFromUrl(device, u.userId, u.name, u.faceUrl!)))
  );
}

async function buildServer() {
  // Fastify's type definitions expect either a boolean or a specific logger interface.
  // Our Pino logger is compatible at runtime but not structurally typed, so cast to any.
  const app = Fastify({ logger: logger as any });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async () => ({ status: 'ready' }));

  app.register(deviceRoutes);


  function ipToInt(ip: string): number {
    return ip.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
  }

  function isIpAllowed(ip: string): boolean {
    if (env.allowlistCidrs.length === 0) return true;
    const ipInt = ipToInt(ip);
    return env.allowlistCidrs.some((cidr) => {
      const [range, bitsStr] = cidr.split('/');
      const bits = Number(bitsStr);
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (ipToInt(range) & mask) === (ipInt & mask);
    });
  }


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


  app.post('/users/sync', async (req, reply) => {
    const users = req.body as any;
    if (!Array.isArray(users)) {
      return reply
        .status(400)
        .send({ status: 'error', message: 'invalid body' });
    }
    try {
      await syncUsersToAsi(users);
    } catch (err) {
      logger.error({ err }, 'syncUsersToAsi failed');
      return reply
        .status(503)
        .send({ status: 'error', message: 'service unavailable' });
    }
    reply.send({ status: 'ok', count: users.length });
  });

  app.post('/asi/webhook', async (req, reply) => {
    if (!isIpAllowed(req.ip)) {
      return reply.status(403).send({ status: 'forbidden' });
    }
    if (env.inboundBasicUser) {
      const auth = req.headers['authorization'];
      if (!auth || !auth.startsWith('Basic ')) {
        return reply.status(401).send({ status: 'unauthorized' });
      }
      const [user, pass] = Buffer.from(auth.slice(6), 'base64')
        .toString()
        .split(':');
      if (user !== env.inboundBasicUser || pass !== env.inboundBasicPass) {
        return reply.status(401).send({ status: 'unauthorized' });
      }
    }
    const bodyStr = JSON.stringify(req.body ?? {});
    const sig = hmacSign(bodyStr, env.cmsHmacKey);
    try {
      await fetch(env.cmsEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': sig,
        },
        body: bodyStr,
      } as any);
    } catch (err) {
      logger.error({ err }, 'forward webhook failed');
      return reply
        .status(503)
        .send({ status: 'error', message: 'service unavailable' });
    }
    reply.send({ status: 'ok' });
  });

  return app;
}

async function start() {
  const app = await buildServer();
  try {
    // cast logger to any to satisfy tcp-listener's Console-based signature
    startAlarmTcpServer(logger as any);
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
