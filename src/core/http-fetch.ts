import fetch from "node-fetch";
import { Agent as HttpsAgent } from "https";

const httpsAgent = new HttpsAgent({
  keepAlive: true,
  maxSockets: 50,
  timeout: 10000,          // socket timeout
});

export async function fetchBufferWithRetry(url: string, maxRetries = 3): Promise<Buffer> {
  let lastErr: any;
  for (let i = 1; i <= maxRetries; i++) {
    try {
      const res = await fetch(url, {
        // ép dùng agent keep-alive
        agent: httpsAgent as any,
        redirect: "follow",               // Firebase có thể 302
        compress: true,                   // OK cho JPEG
        // 10s per try
        // @ts-ignore
        timeout: 10000,
        headers: {
          "user-agent": "asi-gateway/1.0",
          accept: "image/*,application/octet-stream",
          connection: "keep-alive",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      return buf;
    } catch (e: any) {
      lastErr = e;
      const transient = /ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(e?.code || e?.message || "");
      if (!transient || i === maxRetries) break;
      await new Promise(r => setTimeout(r, 500 * i)); // 0.5s, 1s, 1.5s
    }
  }
  throw lastErr;
}
