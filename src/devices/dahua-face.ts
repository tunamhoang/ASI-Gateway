import { digestPostJson } from "../utils/digest.js";

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
  const info: Record<string, unknown> = { PhotoData: [photoBase64] };
  if (userName) info.UserName = userName;
  const body = { UserID: userId, Info: info };

  const add = await digestPostJson(
    `${baseUrl}?action=add`,
    body,
    device.user,
    device.pass,
  );
  if (add.status === 200 && /OK/i.test(add.text)) return "added";

  const upd = await digestPostJson(
    `${baseUrl}?action=update`,
    body,
    device.user,
    device.pass,
  );
  if (upd.status === 200 && /OK/i.test(upd.text)) return "updated";

  throw new Error(
    `face upsert failed: add=${add.status} ${add.text} | update=${upd.status} ${upd.text}`,
  );
}
