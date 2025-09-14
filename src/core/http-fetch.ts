// src/core/http-fetch.ts
import { setTimeout as delay } from 'node:timers/promises';
import { Agent } from 'undici';

type FetchArgs = Parameters<typeof fetch>;
type FetchInput = FetchArgs[0];
type FetchInit = NonNullable<FetchArgs[1]>;

//const httpAgent = new Agent({
//  connections: 8,            // hạn chế kết nối / origin
// pipelining: 0,
//  keepAliveMaxTimeout: 30_000,
//  keepAliveTimeout: 10_000,
//  headersTimeout: 30_000,
// bodyTimeout: 0,            // timeout sẽ do AbortController lo
//});

function isRetryableError(err: any): boolean {
  const msg  = String(err?.message ?? '');
  const code = String(err?.code ?? '');
  return (
    err?.name === 'AbortError' ||
    /other side closed|socket hang up|network|reset/i.test(msg) ||
    code === 'ECONNRESET' ||
    code === 'EAI_AGAIN' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'UND_ERR_SOCKET' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT'
  );
}

export const httpAgent = new Agent({
  connections: 6,
  pipelining: 0,
  keepAliveMaxTimeout: 30000,
  keepAliveTimeout: 10000,
  headersTimeout: 30000,
  bodyTimeout: 0,
});

/** Fetch Buffer với timeout + retry/backoff. */
export async function fetchBufferWithRetry(
  url: string,
  retries = 3,
  timeoutMs = 20_000,
  init: FetchInit = {},
): Promise<Buffer> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url as FetchInput, {
        ...init,
        dispatcher: httpAgent,
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'user-agent': `asi-gateway/${process.env.npm_package_version ?? '1.0.0'} node/${process.versions.node}`,
          accept: 'image/*,application/octet-stream;q=0.8,*/*;q=0.5',
          ...(init.headers as any),
        },
      } as FetchInit);
      clearTimeout(timer);

      if (res.status >= 500 || res.status === 429) {
        const e = new Error(`HTTP ${res.status}`);
        (e as any).status = res.status;
        throw e;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    } catch (err: any) {
      clearTimeout(timer);
      lastErr = err;

      const status = err?.status ?? null;
      const retryable = isRetryableError(err) || status === 429 || (status && status >= 500);
      if (attempt === retries || !retryable) break;

      const backoff = Math.min(800 * 2 ** attempt, 8000) + Math.floor(Math.random() * 300);
      await delay(backoff);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
