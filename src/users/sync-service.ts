import pLimit from 'p-limit';
import sharp from 'sharp';
import { logger } from '../core/logger.js';
import { listDevices } from '../devices/index.js';
import { fetchBufferWithRetry } from '../core/http-fetch.js';
import { httpLimit } from '../core/http-limit.js';
import { buildAsiConfig } from '../devices/dahua-face.js';
import {
  AsiConfig,
  AsiUser,
  createUser,
  getUserById,
  insertUserFace,
} from '../asi/client.js';
import { validateFaceRequest } from '../utils/image.js';

const MAX_FACE_DIMENSION = 2000;

export interface DeviceConn {
  id?: string | number;
  ip: string;
  port?: number;
  https?: boolean;
  username?: string;
  password?: string;
  apiToken?: string;
}

export interface UserSyncItem {
  userId: string;
  name: string;
  citizenIdNo?: string;
  faceImageBase64?: string;
  faceUrl?: string;
}

interface UpsertContext {
  deviceId?: string | number;
}

async function ensureFaceImage(
  item: UserSyncItem,
  ctx: UpsertContext,
): Promise<string> {
  if (item.faceImageBase64) return item.faceImageBase64;
  if (!item.faceUrl) {
    throw new Error('faceImageBase64 is required');
  }

  const buf = await httpLimit(() => fetchBufferWithRetry(item.faceUrl!, 3));
  const base64 = buf.toString('base64');
  logger.info(
    { userId: item.userId, deviceId: ctx.deviceId, bytes: buf.length },
    'downloaded face from url',
  );
  return base64;
}

async function normalizeFace(
  user: UserSyncItem,
  base64: string,
  ctx: UpsertContext,
): Promise<string> {
  const validation = validateFaceRequest({
    personId: user.userId,
    name: user.name,
    imageB64: base64,
  });

  if (validation.issues.length || !validation.normalized) {
    const err = new Error(validation.issues.join('; ') || 'invalid face payload');
    (err as any).issues = validation.issues;
    throw err;
  }

  const buf = Buffer.from(validation.normalized.b64, 'base64');
  if (!(buf[0] === 0xff && buf[1] === 0xd8)) {
    throw new Error('photo not JPEG');
  }

  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w > MAX_FACE_DIMENSION || h > MAX_FACE_DIMENSION) {
    throw new Error('photo dimensions exceed 2000px');
  }

  logger.info(
    {
      userId: user.userId,
      deviceId: ctx.deviceId,
      width: w,
      height: h,
      bytes: validation.normalized.bytes,
    },
    'face normalized',
  );
  return validation.normalized.b64;
}

function mapUserPayload(item: UserSyncItem): AsiUser {
  return {
    userId: item.userId,
    name: item.name,
    citizenIdNo: item.citizenIdNo,
  };
}

export async function upsertUserAndFace(
  cfg: AsiConfig,
  item: UserSyncItem & { faceImageBase64: string },
  ctx: UpsertContext = {},
) {
  if (!item.userId) throw new Error('userId is required');
  if (!item.faceImageBase64) throw new Error('faceImageBase64 is required');

  const logCtx = { userId: item.userId, deviceId: ctx.deviceId, baseUrl: cfg.baseUrl };
  logger.info(logCtx, 'upsertUserAndFace start');

  const lookup = await getUserById(cfg, item.userId);
  if (!lookup.exists) {
    logger.info(logCtx, 'user missing on asi, creating');
    await createUser(cfg, mapUserPayload(item));
  }

  await insertUserFace(cfg, item.userId, item.faceImageBase64);
  logger.info(logCtx, 'upsertUserAndFace done');
  return { ok: true, userId: item.userId };
}

async function processUser(
  cfg: AsiConfig,
  device: DeviceConn,
  item: UserSyncItem,
) {
  const ctx: UpsertContext = { deviceId: device.id ?? device.ip };
  try {
    const raw = await ensureFaceImage(item, ctx);
    const normalized = await normalizeFace(item, raw, ctx);
    await upsertUserAndFace(cfg, { ...item, faceImageBase64: normalized }, ctx);
  } catch (err) {
    logger.error(
      { err, deviceId: ctx.deviceId, userId: item.userId },
      'processUser failed',
    );
    throw err;
  }
}

export async function pushFaceFromUrl(
  device: DeviceConn,
  userId: string,
  name: string,
  faceUrl: string,
) {
  const cfg = buildAsiConfig(device);
  const item: UserSyncItem = { userId, name, faceUrl };
  await processUser(cfg, device, item);
}

export async function syncToDevice(
  device: DeviceConn,
  users: UserSyncItem[],
  requestConcurrency = 4,
) {
  const cfg = buildAsiConfig(device);
  const limit = pLimit(requestConcurrency);

  await Promise.all(
    users.map((user) =>
      limit(async () => {
        try {
          await processUser(cfg, device, user);
        } catch (err) {
          logger.error(
            { err, deviceId: device.id ?? device.ip, userId: user.userId },
            'syncToDevice user failed',
          );
        }
      }),
    ),
  );
}

export async function syncUsersToAsi(
  users: UserSyncItem[],
  deviceConcurrency = 3,
) {
  logger.info({ count: users.length }, 'syncUsersToAsi triggered');
  const devices = (await listDevices()) as DeviceConn[];
  if (!devices.length) {
    logger.warn('syncUsersToAsi skipped: no devices registered');
    return;
  }

  const limit = pLimit(deviceConcurrency);
  await Promise.all(
    devices.map((device) =>
      limit(async () => {
        try {
          await syncToDevice(device, users);
        } catch (err) {
          logger.error({ err, deviceId: device.id }, 'syncToDevice failed');
        }
      }),
    ),
  );
}
