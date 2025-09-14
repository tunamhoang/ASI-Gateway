import { setTimeout as delay } from 'node:timers/promises';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit  = NonNullable<Parameters<typeof fetch>[1]>;

const DEFAULT_UA =
  `asi-gateway/${process.env.npm_package_version ?? '1.0.0'} node/${process.versions.node}`;

function isRetryableError(err: any): boolean {
  const msg  = String(err?.message ?? '');
  const code = String(err?.code ?? '');
  return (
    err?.name === 'AbortError' ||
    /socket hang up|network/i.test(msg) ||
    code === 'ECONNRESET' ||
    code === 'EAI_AGAIN' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT'
  );
}

/**
 * Fetch a resource as Buffer with timeout + retry/backoff.
 */
export async function fetchBufferWithRetry(
  url: string,
  retries = 3,
  timeoutMs = 15_000,
  init: FetchInit = {},
): Promise<Buffer> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url as FetchInput, {
        ...init,
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'user-agent': DEFAULT_UA,
          ...(init.headers as any),
        },
      } as FetchInit);
      clearTimeout(timer);

      // retry 5xx & 429
      if (res.status >= 500 || res.status === 429) {
        const e = new Error(`HTTP ${res.status}`);
        (e as any).status = res.status;
        throw e;
      }
      if (!res.ok) {
        // 4xx khác: không retry
        throw new Error(`HTTP ${res.status}`);
      }

      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    } catch (err: any) {
      clearTimeout(timer);
      lastErr = err;

      const status = err?.status ?? null;
      const retryable = isRetryableError(err) || status === 429 || (status && status >= 500);
      if (attempt === retries || !retryable) break;

      // exponential backoff + jitter
      const backoff = Math.min(600 * 2 ** attempt, 8000) + Math.floor(Math.random() * 200);
      await delay(backoff);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
