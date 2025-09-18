import pLimit from "p-limit";
import { createHash, randomBytes } from "node:crypto";
import { logger } from "../core/logger.js";
import { listDevices } from "../devices/index.js";
import { fetchBufferWithRetry } from "../core/http-fetch.js";
import { httpLimit } from "../core/http-limit.js";

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

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 10_000,
) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

function md5(str: string) {
  return createHash("md5").update(str).digest("hex");
}

function parseDigest(header: string) {
  return header
    .replace(/^Digest\s+/i, "")
    .split(/,\s*/)
    .reduce(
      (acc: Record<string, string>, cur) => {
        const eq = cur.indexOf("=");
        if (eq > 0) {
          const key = cur.slice(0, eq).trim();
          const val = cur
            .slice(eq + 1)
            .trim()
            .replace(/^"|"$/g, "");
          acc[key] = val;
        }
        return acc;
      },
      {} as Record<string, string>,
    );
}

async function fetchWithDigest(
  device: DeviceConn,
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
) {
  // First request to obtain nonce
  const res1 = await fetchWithTimeout(
    url,
    { ...init, headers: { ...(init.headers || {}) } },
    timeoutMs,
  );
  if (res1.status !== 401) return res1;

  const authHeader = res1.headers.get("www-authenticate");
  if (!authHeader) return res1;
  res1.body?.cancel();

  const params = parseDigest(authHeader);
  const method = (init.method || "GET").toUpperCase();
  const uri = new URL(url).pathname + new URL(url).search;
  const nc = "00000001";
  const cnonce = randomBytes(8).toString("hex");
  const ha1 = md5(`${device.username}:${params.realm}:${device.password}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = md5(
    `${ha1}:${params.nonce}:${nc}:${cnonce}:${params.qop}:${ha2}`,
  );

  let header =
    `Digest username="${device.username}", realm="${params.realm}", nonce="${params.nonce}", uri="${uri}", ` +
    `qop=${params.qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
  if (params.opaque) header += `, opaque="${params.opaque}"`;

  const headers = { ...(init.headers || {}), Authorization: header } as Record<
    string,
    string
  >;
  return fetchWithTimeout(url, { ...init, headers }, timeoutMs);
}

async function assertOk(res: Response, ctx: Record<string, unknown>) {
  if (!res.ok) {
    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {}
    const err = new Error(`HTTP ${res.status} ${res.statusText}`);
    logger.warn(
      {
        ...ctx,
        status: res.status,
        statusText: res.statusText,
        body: bodyText.slice(0, 500),
      },
      "request failed",
    );
    throw err;
  }
}

export async function upsertFace(
  device: DeviceConn,
  userId: string,
  photoBase64: string,
  userName?: string,
) {
  const scheme = device.https ? "https" : "http";
  const baseUrl = `${scheme}://${device.ip}:${device.port}/cgi-bin/FaceInfoManager.cgi`;
  const headers = {
    "Content-Type": "application/json",
  } as const;

  if (typeof userId !== "string" || userId.trim() === "") {
    logger.warn({ deviceId: device.id, userId }, "upsertFace skipped: invalid userId");
    return;
  }

  if (typeof photoBase64 !== "string" || photoBase64.trim() === "") {
    logger.warn(
      { deviceId: device.id, userId },
      "upsertFace skipped: invalid photoBase64",
    );
    return;
  }

  if (/\r|\n/.test(photoBase64)) {
    logger.warn(
      { deviceId: device.id, userId },
      "upsertFace skipped: multiline photoBase64",
    );
    return;
  }

  if (photoBase64.length > 200_000) {
    logger.warn(
      { deviceId: device.id, userId },
      "upsertFace skipped: photoBase64 too long",
    );
    return;
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(photoBase64, "base64");
    // re-encode to ensure string was valid base64 without extra noise
    if (buf.length === 0 || buf.toString("base64") !== photoBase64) {
      logger.warn(
        { deviceId: device.id, userId },
        "upsertFace skipped: invalid photoBase64",
      );
      return;
    }
  } catch {
    logger.warn(
      { deviceId: device.id, userId },
      "upsertFace skipped: invalid photoBase64",
    );
    return;
  }

  if (!(buf[0] === 0xff && buf[1] === 0xd8)) {
    logger.warn(
      { deviceId: device.id, userId },
      "upsertFace skipped: photo not JPEG",
    );
    return;
  }

  const info: Record<string, unknown> = { PhotoData: [photoBase64] };
  if (userName) info.UserName = userName;

  const body = { UserID: userId, Info: info };

  let addText = "";
  try {
    const addRes = await fetchWithDigest(
      device,
      `${baseUrl}?action=add&format=json`,
      { method: "POST", headers, body: JSON.stringify(body) },
      10_000,
    );
    addText = await addRes.text();
    if (addRes.status === 200 && /OK/i.test(addText)) return;
  } catch (err) {
    logger.warn({ err, deviceId: device.id, userId }, "upsertFace add failed");
  }

  const updRes = await fetchWithDigest(
    device,
    `${baseUrl}?action=update&format=json`,
    { method: "POST", headers, body: JSON.stringify(body) },
    10_000,
  );
  const updText = await updRes.text();
  if (updRes.status === 200 && /OK/i.test(updText)) return;
  throw new Error(
    `face upsert failed: add=${addText.slice(0, 200)} | update=${updRes.status} ${updText.slice(0, 200)}`,
  );
}

export async function pushFaceFromUrl(
  device: DeviceConn,
  userId: string,
  userName: string,
  faceUrl: string,
) {
  try {
    const buf = await fetchBufferWithRetry(faceUrl, 3);
    const photoBase64 = buf.toString("base64");
    await upsertFace(device, userId, photoBase64, userName);
  } catch (err) {
    logger.warn(
      { err, deviceId: device.id, userId, faceUrl },
      "push face failed",
    );
  }
}

export async function syncUsersToAsi(
  users: UserSyncItem[],
  deviceConcurrency = 5,
): Promise<void> {
  logger.info({ count: users.length }, "syncUsersToAsi triggered");

  let devices: DeviceConn[];
  try {
    devices = (await listDevices()) as DeviceConn[];
  } catch (err) {
    logger.error({ err }, "listDevices failed");
    throw err;
  }

  const limit = pLimit(deviceConcurrency);
  await Promise.all(
    devices.map((device) => limit(() => syncToDevice(device, users))),
  );
}

export async function syncToDevice(
  device: DeviceConn,
  users: UserSyncItem[],
  requestConcurrency = 5,
) {
  const scheme = device.https ? "https" : "http";
  const headers = {
    "Content-Type": "application/json",
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
          const res = await fetchWithDigest(
            device,
            url,
            { method: "POST", headers, body: JSON.stringify(body) },
            10_000,
          );
          await assertOk(res, {
            deviceId: device.id,
            api: "AccessUser.insertMulti",
            users: body.UserData.length,
          });
        } catch (err) {
          logger.warn({ err, deviceId: device.id }, "insertMulti failed");
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
            await upsertFace(device, u.userId, u.faceImageBase64, u.name);
          } else if (u.faceUrl) {
            await pushFaceFromUrl(device, u.userId, u.name, u.faceUrl);
          }
        } catch (err) {
          logger.warn(
            { err, deviceId: device.id, userId: u.userId },
            "push face (direct) failed",
          );
        }
      }),
    ),
  );
}
