import fetch from 'node-fetch';
import pLimit from 'p-limit';
import { logger } from '../core/logger.js';
import { listDevices } from '../devices/index.js';
import { fetchBufferWithRetry } from '../core/http-fetch.js';

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

export async function pushFaceFromUrl(device, userId: string, userName: string, faceUrl: string) {
  const buf = await fetchBufferWithRetry(faceUrl, 3);
  await addFace(device, { userId, userName, photoBase64: b64 });
}

export async function syncUsersToAsi(
  users: UserSyncItem[],
  deviceConcurrency = 5,
): Promise<void> {
  logger.info({ count: users.length }, 'syncUsersToAsi triggered');
  let devices;
  try {
    devices = await listDevices();
  } catch (err) {
    logger.error({ err }, 'listDevices failed');
    throw err;
  }
  const limit = pLimit(deviceConcurrency);
  await Promise.all(
    devices.map((device) => limit(() => syncToDevice(device, users))),
  );
}

export async function syncToDevice(
  device: any,
  users: UserSyncItem[],
  requestConcurrency = 5,
) {
  const scheme = device.https ? 'https' : 'http';
  const authHeader = {
    Authorization:
      'Basic ' +
      Buffer.from(`${device.username}:${device.password}`).toString('base64'),
    'Content-Type': 'application/json',
  };
  const limit = pLimit(requestConcurrency);

  const batches = chunk(users, 10);
  await Promise.all(
    batches.map((batch) =>
      limit(async () => {
        const url = `${scheme}://${device.ip}:${device.port}/cgi-bin/AccessUser.cgi?action=insertMulti&format=json`;
        const body = {
          UserData: batch.map((u) => ({
            UserID: u.userId,
            UserName: u.name,
            CitizenIDNo: u.citizenIdNo,
          })),
        };
        try {
          await fetch(url, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify(body),
            timeout: 10000,
          } as any);
        } catch (err) {
          logger.warn({ err, deviceId: device.id }, 'insertMulti failed');
        }
      }),
    ),
  );

  const faceUsers = users.filter((u) => u.faceImageBase64);
  await Promise.all(
    faceUsers.map((u) =>
      limit(async () => {
        const url = `${scheme}://${device.ip}:${device.port}/cgi-bin/FaceInfoManager.cgi?action=add&format=json`;
        const body = {
          UserID: u.userId,
          Info: { PhotoData: [u.faceImageBase64] },
        };
        try {
          await fetch(url, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify(body),
            timeout: 10000,
          } as any);
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

