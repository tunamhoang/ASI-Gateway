import pLimit from 'p-limit';
import { logger } from '../core/logger.js';
import { listDevices } from '../devices/index.js';
import { fetchBufferWithRetry } from '../core/http-fetch.js';
import { httpLimit } from '../core/http-limit.js';

export interface DeviceConn {
  id: string | number;
  ip: string;
  port: number;
  https?: boolean;
  username: string;
  password: string;
}

export interface UserSyncItem {
  userId: string;
  name: string;
  citizenIdNo?: string;
  faceImageBase64?: string;
  faceUrl?: string; // ✅ thêm để đồng bộ với đoạn push từ URL
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

function basicAuth(device: DeviceConn) {
  return 'Basic ' + Buffer.from(`${device.username}:${device.password}`).toString('base64');
}

async function assertOk(res: Response, ctx: Record<string, unknown>) {
  if (!res.ok) {
    let bodyText = '';
    try { bodyText = await res.text(); } catch {}
    const err = new Error(`HTTP ${res.status} ${res.statusText}`);
    logger.warn({ ...ctx, status: res.status, statusText: res.statusText, body: bodyText.slice(0, 500) }, 'request failed');
    throw err;
  }
}

export async function addFace(
  device: DeviceConn,
  userId: string,
  photoBase64: string,
  userName?: string,
) {
  const scheme = device.https ? 'https' : 'http';
  const url = `${scheme}://${device.ip}:${device.port}/cgi-bin/FaceInfoManager.cgi?action=add&format=json`;
  const headers = {
    Authorization: basicAuth(device),
    'Content-Type': 'application/json',
  } as const;

  const info: Record<string, unknown> = { PhotoData: [photoBase64] };
  if (userName) info.UserName = userName;

  const body = { UserID: userId, Info: info };

  const res = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(body) }, 10_000);
  await assertOk(res, { deviceId: device.id, userId, api: 'FaceInfoManager.add' });
}

export async function pushFaceFromUrl(
  device: DeviceConn,
  userId: string,
  userName: string,
  faceUrl: string,
) {
  try {
    const buf = await fetchBufferWithRetry(faceUrl, 3);
    const photoBase64 = buf.toString('base64');
    await addFace(device, userId, photoBase64, userName);
  } catch (err) {
    logger.warn({ err, deviceId: device.id, userId, faceUrl }, 'push face failed');
  }
}

export async function syncUsersToAsi(
  users: UserSyncItem[],
  deviceConcurrency = 5,
): Promise<void> {
  logger.info({ count: users.length }, 'syncUsersToAsi triggered');

  let devices: DeviceConn[];
  try {
    devices = (await listDevices()) as DeviceConn[];
  } catch (err) {
    logger.error({ err }, 'listDevices failed');
    throw err;
  }

  const limit = pLimit(deviceConcurrency);
  await Promise.all(devices.map((device) => limit(() => syncToDevice(device, users))));
}

export async function syncToDevice(
  device: DeviceConn,
  users: UserSyncItem[],
  requestConcurrency = 5,
) {
  const scheme = device.https ? 'https' : 'http';
  const headers = {
    Authorization: basicAuth(device),
    'Content-Type': 'application/json',
  } as const;

  const limit = pLimit(requestConcurrency);

  // 1) Push user metadata theo batch 10
  const batches = chunk(users, 10);
  await Promise.all(
    batches.map((batch) =>
      limit(async () => {
        const url = `${scheme}://${device.ip}:${device.port}/cgi-bin/AccessUser.cgi?action=insertMulti&format=json`;
        const body = {
          UserData: batch.map((u) => {
            const x: Record<string, unknown> = {
              UserID: u.userId,
              UserName: u.name,
            };
            if (u.citizenIdNo) x.CitizenIDNo = u.citizenIdNo; // ✅ loại undefined
            return x;
          }),
        };

        try {
          const res = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(body) }, 10_000);
          await assertOk(res, { deviceId: device.id, api: 'AccessUser.insertMulti', users: body.UserData.length });
        } catch (err) {
          logger.warn({ err, deviceId: device.id }, 'insertMulti failed');
        }
      }),
    ),
  );

  // 2) Push khuôn mặt (nếu có)
  const faceUsers = users.filter((u) => u.faceImageBase64 || u.faceUrl);
  await Promise.all(
    faceUsers.map((u) =>
      httpLimit(async () => {
        try {
          if (u.faceImageBase64) {
            await addFace(device, u.userId, u.faceImageBase64, u.name);
          } else if (u.faceUrl) {
            await pushFaceFromUrl(device, u.userId, u.name, u.faceUrl);
          }
        } catch (err) {
          logger.warn({ err, deviceId: device.id, userId: u.userId }, 'push face (direct) failed');
        }
      }),
    ),
  );
}
