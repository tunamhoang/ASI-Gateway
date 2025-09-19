import pLimit from "p-limit";
import sharp from "sharp";
import { createHash, randomBytes } from "node:crypto";
import { logger } from "../core/logger.js";
import { listDevices } from "../devices/index.js";
import { fetchBufferWithRetry } from "../core/http-fetch.js";
import { httpLimit } from "../core/http-limit.js";
import { upsertFace as deviceUpsertFace } from "../devices/dahua-face.js";

const MAX_FACE_DIMENSION = 2000;
const MAX_FACE_BASE64_LENGTH = 200_000;

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


export function isLikelyJpegBase64(s?: string): boolean {
  if (!s) return false;
  const trimmed = s.trim();
  return (
    trimmed.length >= 1000 &&
    /^[A-Za-z0-9+/=]+$/.test(trimmed) &&
    trimmed.startsWith("/9j")
  );
}

export async function upsertFace(
  device: DeviceConn,
  userId: string,
  photoBase64: string,
  userName?: string,
) {
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

  const hasNewline = /\r|\n/.test(photoBase64);
  const trimmed = photoBase64.trim();
  logger.info(
    {
      userId,
      len: trimmed.length,
      head: trimmed.slice(0, 20),
      tail: trimmed.slice(-20),
    },
    "face payload check",
  );

  if (!isLikelyJpegBase64(photoBase64)) {
    logger.warn({ userId, reason: "no_or_bad_face" }, "skip push face");
    return;
  }

  if (hasNewline) {
    logger.warn(
      { deviceId: device.id, userId },
      "upsertFace skipped: multiline photoBase64",
    );
    return;
  }

  if (trimmed.length > MAX_FACE_BASE64_LENGTH) {
    logger.warn(
      { deviceId: device.id, userId, length: trimmed.length },
      "upsertFace skipped: photoBase64 too long",
    );
    return;
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    logger.warn(
      { deviceId: device.id, userId },
      "upsertFace skipped: invalid photoBase64 characters",

    );
    return;
  }


  let buf: Buffer;
  try {
    buf = Buffer.from(trimmed, "base64");
    // re-encode to ensure string was valid base64 without extra noise
    if (buf.length === 0 || buf.toString("base64") !== trimmed) {

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

  try {
    const { width, height } = await sharp(buf).metadata();
    const w = width ?? 0;
    const h = height ?? 0;
    if (w > MAX_FACE_DIMENSION || h > MAX_FACE_DIMENSION) {
      logger.warn(
        { deviceId: device.id, userId, width: w, height: h },
        "upsertFace skipped: photo dimensions exceed 2000px",
      );
      return;
    }
  } catch (err) {
    logger.warn(
      { deviceId: device.id, userId, err },
      "upsertFace skipped: invalid photoBase64",
    );
    return;
  }

  const info: Record<string, unknown> = { PhotoData: [trimmed] };
  if (userName) info.UserName = userName;

  const body = { UserID: userId, Info: info };


  const scheme = device.https ? "https" : "http";
  const host = device.port ? `${device.ip}:${device.port}` : device.ip;
  await deviceUpsertFace(
    { host, user: device.username, pass: device.password, scheme },
    { userId, userName, photoBase64: trimmed },

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
