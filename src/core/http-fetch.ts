import fetch from 'node-fetch';

/**
 * Fetch a resource as a Buffer with simple retry logic.
 *
 * @param url The URL to fetch.
 * @param retries Number of attempts before failing.
 */
export async function fetchBufferWithRetry(
  url: string,
  retries = 0,
): Promise<Buffer> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const arr = await res.arrayBuffer();
      return Buffer.from(arr);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
