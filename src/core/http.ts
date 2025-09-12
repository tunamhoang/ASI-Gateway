import { request, Agent } from "undici";

const agent = new Agent({
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 60_000,
  connect: { timeout: 10_000 },
});

export async function fetchBufferWithRetry(url: string, maxRetries = 3): Promise<Buffer> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { statusCode, body } = await request(url, {
        method: "GET",
        dispatcher: agent,
        maxRedirections: 3,                 // theo dõi redirect của Firebase
        headers: {
          "user-agent": "asi-gateway/1.0",
          accept: "image/*,application/octet-stream",
          connection: "keep-alive",
        },
      });
      if (!statusCode || statusCode >= 400) throw new Error(`HTTP ${statusCode}`);
      const ab = await body.arrayBuffer();
      return Buffer.from(ab);
    } catch (e: any) {
      lastErr = e;
      const transient = /ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(e?.code || e?.message || "");
      if (!transient || attempt === maxRetries) break;
      await new Promise(r => setTimeout(r, 500 * attempt));   // backoff: 0.5s,1s,1.5s
    }
  }
  throw lastErr;
}
