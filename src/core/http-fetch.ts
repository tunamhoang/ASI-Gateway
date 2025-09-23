// src/core/http-fetch.ts
import { setTimeout as delay } from 'node:timers/promises';
import { Agent } from 'undici';

type FetchArgs = Parameters<typeof fetch>;
type FetchInput = FetchArgs[0];
type FetchInit = NonNullable<FetchArgs[1]>;

function isRetryableError(err: any): boolean {
  const msg = String(err?.message ?? '');
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
  connections: 8,
  pipelining: 0,
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 30_000,
  headersTimeout: 30_000,
  bodyTimeout: 0,
});

export interface FetchRetryOptions extends FetchInit {
  /** Maximum retry attempts on retryable errors. */
  maxRetries?: number;
  /** Timeout per attempt in milliseconds. */
  timeoutMs?: number;
  /** Override retryable response predicate. */
  retryOnResponse?: (response: Response) => boolean;
}

function shouldRetryResponse(res: Response): boolean {
  return res.status === 429 || res.status >= 500;
}

function computeBackoff(attempt: number): number {
  const base = 300 * 2 ** attempt;
  const capped = Math.min(base, 8_000);
  const jitter = Math.floor(Math.random() * 250);
  return capped + jitter;
}

export async function fetchWithRetry(
  input: FetchInput,
  init: FetchRetryOptions = {},
): Promise<Response> {
  const { maxRetries = 3, timeoutMs = 20_000, retryOnResponse, ...rest } = init;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(input, {
        ...rest,
        dispatcher: httpAgent,
        signal: controller.signal,
      } as FetchInit);

      if ((retryOnResponse ?? shouldRetryResponse)(res) && attempt < maxRetries) {
        // ensure body stream is released before retrying
        try {
          res.body?.cancel();
        } catch {}
        await delay(computeBackoff(attempt));
        continue;
      }

      clearTimeout(timer);
      return res;
    } catch (err) {
      lastErr = err;
      const retryable = isRetryableError(err);
      if (attempt === maxRetries || !retryable) {
        clearTimeout(timer);
        break;
      }

      clearTimeout(timer);
      await delay(computeBackoff(attempt));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Fetch Buffer với timeout + retry/backoff. */
export async function fetchBufferWithRetry(
  url: string,
  retries = 3,
  timeoutMs = 20_000,
  init: FetchInit = {},
): Promise<Buffer> {
  const res = await fetchWithRetry(url as FetchInput, {
    ...init,
    maxRetries: retries,
    timeoutMs,
    redirect: 'follow',
    headers: {
      'user-agent': `asi-gateway/${process.env.npm_package_version ?? '1.0.0'} node/${process.versions.node}`,
      accept: 'image/*,application/octet-stream;q=0.8,*/*;q=0.5',
      ...(init.headers as any),
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}
