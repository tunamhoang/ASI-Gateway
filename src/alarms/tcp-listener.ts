import net from "net";
import crypto from "crypto";
import fetch from "node-fetch";

const PORT = parseInt(process.env.ALARM_TCP_PORT || "8888", 10);
const CMS_ENDPOINT = process.env.CMS_ENDPOINT!;
const CMS_HMAC_KEY = process.env.CMS_HMAC_KEY || "change_me";
const MAX_RETRIES = parseInt(process.env.ALARM_MAX_RETRIES || "3", 10);
const RETRY_BACKOFF_MS = parseInt(
  process.env.ALARM_RETRY_BACKOFF_MS || "1000",
  10
);

// (tùy chọn) xác thực thiết bị theo User/Pass đã cấu hình ở AlarmServer.UserName/Password
const INBOUND_USER = process.env.INBOUND_BASIC_USER || "admin";
const INBOUND_PASS = process.env.INBOUND_BASIC_PASS || "admin123";

function tryParseEvent(buf: Buffer) {
  const text = buf.toString("utf8").trim();

  // 1) nếu gói là JSON thuần
  try {
    const j = JSON.parse(text);
    return {
      userId: j.UserID || j.userId || j.user?.id || null,
      timestamp: j.Time || j.timestamp || new Date().toISOString(),
      deviceId: j.DeviceID || j.source || "ASI",
      method: j.Method || "face",
      raw: j,
    };
  } catch {}

  // 2) nếu là dạng key=value / dòng thô → trích heuristics
  const kv: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([^=:\s]+)\s*[:=]\s*(.+)$/);
    if (m) kv[m[1]] = m[2];
  }
  if (Object.keys(kv).length) {
    return {
      userId: kv.UserID || kv.CardNo || kv.User || null,
      timestamp: kv.Time || kv.Timestamp || new Date().toISOString(),
      deviceId: kv.DeviceID || kv.Source || "ASI",
      method: kv.Method || kv.AuthType || "unknown",
      raw: { text, kv },
    };
  }

  // 3) không parse được → trả thô (hex + text)
  return {
    userId: null,
    timestamp: new Date().toISOString(),
    deviceId: "ASI",
    method: "unknown",
    raw: { text, hex: buf.toString("hex") },
  };
}

async function forwardToCMS(evt: any) {
  const body = JSON.stringify(evt);
  const sig = crypto.createHmac("sha256", CMS_HMAC_KEY).update(body).digest("hex");
  const res = await fetch(CMS_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature": sig,
    },
    body,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`CMS ${res.status} ${t}`);
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const failedEvents: any[] = [];

export async function forwardWithRetry(evt: any, logger = console) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await forwardToCMS(evt);
      return;
    } catch (err: any) {
      logger.warn?.(
        { err: err.message, attempt: attempt + 1 },
        "cms-forward-retry"
      );
      const delay = RETRY_BACKOFF_MS * Math.pow(2, attempt);
      await wait(delay);
    }
  }
  failedEvents.push(evt);
}

export async function processFailedEvents(logger = console) {
  while (failedEvents.length) {
    const evt = failedEvents.shift();
    if (evt) await forwardWithRetry(evt, logger);
  }
}

export function startAlarmTcpServer(logger = console) {
  const server = net.createServer((socket) => {
    const peer = `${socket.remoteAddress}:${socket.remotePort}`;
    logger.info?.(`ASI connected: ${peer}`);

    let authed = false;

    socket.on("data", async (chunk) => {
      try {
        // (tùy firmware) nếu gói đầu có user/pass, bạn có thể tự định nghĩa:
        // ví dụ "AUTH asi:asi_pass\n"
        const t = chunk.toString("utf8");
        if (!authed && t.startsWith("AUTH ")) {
          const cred = t.slice(5).trim();
          if (cred === `${INBOUND_USER}:${INBOUND_PASS}`) {
            authed = true;
            socket.write("OK\n");
            return;
          } else {
            socket.write("ERR auth\n");
            socket.end();
            return;
          }
        }

        const evt = tryParseEvent(chunk);
        logger.info?.({ peer, evt }, "alarm-event");
        await forwardWithRetry(evt, logger);
        socket.write("ACK\n");
      } catch (e: any) {
        logger.error?.({ peer, err: e.message }, "alarm-forward-error");
        // vẫn trả ACK để tránh thiết bị flood; bạn có thể sửa thành NACK nếu cần
        socket.write("ACK\n");
      }
    });

    socket.on("error", (err) => logger.error?.({ peer, err }, "socket-error"));
    socket.on("close", () => logger.info?.(`ASI disconnected: ${peer}`));
  });

  server.listen(PORT, "0.0.0.0", () => {
    logger.info?.(`Alarm TCP listening on 0.0.0.0:${PORT}`);
  });

  setInterval(() => processFailedEvents(logger), RETRY_BACKOFF_MS).unref();

  return server;
}
