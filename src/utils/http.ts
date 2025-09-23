import FormData from 'form-data';

export const ACCEPT_HEADER = 'application/json, text/plain, */*';

type FetchError = Error & {
  status: number;
  headers: Record<string, string>;
  body: string;
};

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

type FetchVerboseResult<T = unknown> = {
  res: FetchResponse;
  data: T;
  headers: Record<string, string>;
  raw: string;
};

function normalizeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    out[key] = value;
  }
  return out;
}

function truncateBody(body: string): string {
  if (body.length <= 2000) return body;
  return `${body.slice(0, 2000)}…[truncated]`;
}

export async function fetchVerbose(url: string, init: RequestInit = {}): Promise<FetchVerboseResult> {
  const res = await fetch(url, init);
  const raw = await res.text();
  const headers = normalizeHeaders(res.headers);
  const preview = truncateBody(raw);

  if (!res.ok) {
    const err: FetchError = Object.assign(
      new Error(`HTTP ${res.status} ${res.statusText}`),
      {
        status: res.status,
        headers,
        body: preview,
      },
    );
    throw err;
  }

  try {
    return { res, data: JSON.parse(raw), headers, raw };
  } catch {
    return { res, data: raw, headers, raw };
  }
}

export async function postJson(url: string, payload: unknown, headers: Record<string, string> = {}) {
  return fetchVerbose(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
}

export async function postMultipart(
  url: string,
  fields: Record<string, string>,
  headers: Record<string, string> = {},
) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value);
  }
  return fetchVerbose(url, { method: 'POST', body: fd as any, headers });
}
