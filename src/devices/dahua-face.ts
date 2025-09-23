import { logger } from "../core/logger.js";
import { digestPostJson } from "../utils/digest.js";
import { normalizeBase64Jpeg } from "../utils/image.js";

function previewBody(body: string) {
  return body.length > 2000 ? `${body.slice(0, 2000)}…[truncated]` : body;
}

function logFailure(
  action: string,
  res: { status: number; text: string; headers: Record<string, string> },
) {
  let parsed: unknown = res.text;
  try {
    parsed = JSON.parse(res.text);
  } catch {}

  logger.warn(
    {
      action,
      status: res.status,
      headers: res.headers,
      body: previewBody(res.text),
      parsed,
    },
    "dahua-face request failed",
  );
}

export interface DahuaFaceDevice {
  host: string;
  user: string;
  pass: string;
  scheme?: "http" | "https";
}

interface UpsertFacePayload {
  userId: string;
  userName?: string;
  photoBase64: string;
}

export async function upsertFace(
  device: DahuaFaceDevice,
  { userId, userName, photoBase64 }: UpsertFacePayload,
): Promise<"added" | "updated"> {
  const scheme = device.scheme ?? "http";
  const baseUrl = `${scheme}://${device.host}/cgi-bin/FaceInfoManager.cgi`;
  const { b64 } = normalizeBase64Jpeg(photoBase64);
  const safeName = userName?.trim();
  const info: Record<string, unknown> = { PhotoData: [b64] };
  if (safeName) info.UserName = safeName.slice(0, 32);
  const body = { UserID: userId, Info: info };

  const add = await digestPostJson(
    `${baseUrl}?action=add`,
    body,
    device.user,
    device.pass,
  );
  if (add.status === 200 && /OK/i.test(add.text)) return "added";
  logFailure("add", add);

  const upd = await digestPostJson(
    `${baseUrl}?action=update`,
    body,
    device.user,
    device.pass,
  );
  if (upd.status === 200 && /OK/i.test(upd.text)) return "updated";
  logFailure("update", upd);

  throw new Error(
    `face upsert failed: add=${add.status} ${previewBody(add.text)} | update=${upd.status} ${previewBody(
      upd.text,
    )}`,
  );
}
