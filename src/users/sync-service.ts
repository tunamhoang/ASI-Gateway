//import fetch from 'node-fetch';
import pLimit from 'p-limit';
import { logger } from '../core/logger.js';
import { listDevices } from '../devices/index.js';
//import type { Device } from '@prisma/client';
import { fetchBufferWithRetry } from '../core/http-fetch.js';

// ⬇️ Khai báo kiểu cho thiết bị (điều chỉnh nếu bạn có type sẵn)
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
}

function chunk<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    res.push(arr.slice(i, i + size));
  }
  return res;
}

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit  = Parameters<typeof fetch>[1];

// ⬇️ Helper fetch với timeout chuẩn
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

export async function addFace(
  device: DeviceConn,
  userId: string,
  photoBase64: string,
  userName?: string,
) {
  const scheme = device.https ? 'https' : 'http';
  const url = `${scheme}://${device.ip}:${device.port}/cgi-bin/FaceInfoManager.cgi?action=add&format=json`;
  const headers = {
    Authorization:
      'Basic ' + Buffer.from(`${device.username}:${device.password}`).toString('base64'),
    'Content-Type': 'application/json',
  } as const;

  const info: Record<string, unknown> = { PhotoData: [photoBase64] };
  if (userName) info.UserName = userName;

  const body = { UserID: userId, Info: info };

  await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }, 10_000);
}

export async function pushFaceFromUrl(
  device: DeviceConn,          // ✅ gõ kiểu
  userId: string,
  userName: string,
  faceUrl: string,
) {
  const buf = await fetchBufferWithRetry(faceUrl, 3);
  const photoBase64 = buf.toString('base64');
  try {
    await addFace(device, userId, photoBase64, userName);
  } catch (err) {
    logger.warn({ err, deviceId: device.id, userId }, 'push face failed');
  }
}

export async function syncUsersToAsi(
  users: UserSyncItem[],
  deviceConcurrency = 5,
): Promise<void> {
  logger.info({ count: users.length }, 'syncUsersToAsi triggered');

  let devices: DeviceConn[];
  try {
    // Nếu listDevices đã có type, bỏ phần `as DeviceConn[]`
    devices = (await listDevices()) as DeviceConn[];
  } catch (err) {
    logger.error({ err }, 'listDevices failed');
    throw err;
  }

  const limit = pLimit(deviceConcurrency);
  await Promise.all(
    devices.map((device: DeviceConn) => limit(() => syncToDevice(device, users))),
  );
}

export async function syncToDevice(
  device: DeviceConn,
  users: UserSyncItem[],
  requestConcurrency = 5,
) {
  const scheme = device.https ? 'https' : 'http';
  const headers = {
    Authorization:
      'Basic ' + Buffer.from(`${device.username}:${device.password}`).toString('base64'),
    'Content-Type': 'application/json',
  } as const;

  const limit = pLimit(requestConcurrency);

  // 1) Push user metadata theo batch 10
  const batches = chunk(users, 10);
  await Promise.all(
    batches.map((batch: UserSyncItem[]) =>
      limit(async () => {
        const url = `${scheme}://${device.ip}:${device.port}/cgi-bin/AccessUser.cgi?action=insertMulti&format=json`;
        const body = {
          UserData: batch.map((u: UserSyncItem) => ({
            UserID: u.userId,
            UserName: u.name,
            CitizenIDNo: u.citizenIdNo,
          })),
        };

        try {
          await fetchWithTimeout(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          }, 10_000);
        } catch (err) {
          logger.warn({ err, deviceId: device.id }, 'insertMulti failed');
        }
      }),
    ),
  );

  // 2) Push khuôn mặt (nếu có)
  const faceUsers = users.filter((u) => u.faceImageBase64);
  await Promise.all(
    faceUsers.map((u: UserSyncItem) =>
      limit(async () => {
        try {
          await addFace(device, u.userId, u.faceImageBase64!, u.name);
        } catch (err) {
          logger.warn(
            { err, deviceId: device.id, userId: u.userId },
            'push face failed',
          );
        }
      }),
    ),
  );
}