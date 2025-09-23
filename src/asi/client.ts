import { fetchWithRetry } from '../core/http-fetch.js';
import { logger } from '../core/logger.js';

export interface AsiConfig {
  baseUrl: string;
  token: string;
}

export interface AsiUser {
  userId: string;
  name: string;
  citizenIdNo?: string;
  status?: string;
  userType?: string;
}

const DEFAULT_USER_STATUS = 'normal';
const DEFAULT_USER_TYPE = 'normal';

function resolveBaseUrl(url: string): string {
  if (!/^https?:\/\//i.test(url)) {
    return `http://${url.replace(/^\//, '')}`;
  }
  return url.endsWith('/') ? url : `${url}/`;
}

function buildUrl(cfg: AsiConfig, path: string, query?: Record<string, string | undefined>): URL {
  const base = resolveBaseUrl(cfg.baseUrl);
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const url = new URL(cleanPath, base);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    }
  }
  return url;
}

function resolveAuthHeader(token: string): string | undefined {
  if (!token) return undefined;
  if (/^\s*(?:basic|bearer)\s+/i.test(token)) {
    return token;
  }
  if (token.includes(':')) {
    return `Basic ${Buffer.from(token).toString('base64')}`;
  }
  return `Bearer ${token}`;
}

function defaultHeaders(cfg: AsiConfig, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    Connection: 'keep-alive',
    ...extra,
  };
  const auth = resolveAuthHeader(cfg.token);
  if (auth) headers.Authorization = auth;
  return headers;
}

async function parseJsonResponse(res: Response): Promise<{ data: unknown; raw: string }> {
  const raw = await res.text();
  if (!raw) {
    return { data: null, raw: '' };
  }
  try {
    return { data: JSON.parse(raw), raw };
  } catch (err) {
    logger.warn({ status: res.status, body: raw.slice(0, 400) }, 'asi response not valid json');
    throw err;
  }
}

function maskSensitive(value: string | undefined): string | undefined {
  if (!value) return value;
  if (value.length <= 4) return '***';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function extractUserList(payload: any): any[] {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload)) return payload;
  const keys = [
    'UserList',
    'UserData',
    'userList',
    'data',
    'Data',
    'UserInfo',
  ];
  for (const key of keys) {
    const value = (payload as any)[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const inner = extractUserList(value);
      if (inner.length) return inner;
    }
  }
  return [];
}

function toAsiUser(raw: any): AsiUser | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const userId = raw.UserID ?? raw.userId ?? raw.id ?? raw.PersonID;
  const name = raw.UserName ?? raw.userName ?? raw.name ?? raw.FullName;
  if (!userId) return undefined;
  return {
    userId: String(userId),
    name: name ? String(name) : '',
    citizenIdNo: raw.CitizenIDNo ?? raw.citizenIdNo ?? raw.IDCardNo ?? raw.idCardNo,
    status: raw.Status ?? raw.status,
    userType: raw.UserType ?? raw.userType,
  };
}

function buildUserPayload(payload: AsiUser): Record<string, unknown> {
  const user: Record<string, unknown> = {
    UserID: payload.userId,
    UserName: payload.name,
    Status: payload.status ?? DEFAULT_USER_STATUS,
    UserType: payload.userType ?? DEFAULT_USER_TYPE,
    Password: '',
  };
  if (payload.citizenIdNo) user.CitizenIDNo = payload.citizenIdNo;
  user.Valid = {
    Enable: true,
    BeginTime: '1970-01-01 00:00:00',
    EndTime: '2099-12-31 23:59:59',
  };
  return user;
}

export async function getUserById(
  cfg: AsiConfig,
  userId: string,
): Promise<{ exists: boolean; user?: AsiUser }> {
  const url = buildUrl(cfg, '/cgi-bin/AccessUser.cgi', {
    action: 'list',
    format: 'json',
    'UserIDList[0]': userId,
  });

  const res = await fetchWithRetry(url.toString(), {
    method: 'GET',
    headers: defaultHeaders(cfg),
  });

  if (res.status === 404) {
    return { exists: false };
  }

  if (!res.ok) {
    const { raw } = await parseJsonResponse(res).catch(async () => ({ raw: await res.text() }));
    logger.warn(
      {
        userId,
        baseUrl: cfg.baseUrl,
        status: res.status,
        token: maskSensitive(cfg.token),
        body: raw?.slice?.(0, 400),
      },
      'asi getUserById failed',
    );
    throw new Error(`getUserById failed with status ${res.status}`);
  }

  const { data } = await parseJsonResponse(res);
  const list = extractUserList(data);
  const found = list
    .map((item) => toAsiUser(item))
    .find((user): user is AsiUser => !!user && user.userId === userId);

  if (!found) {
    return { exists: false };
  }

  logger.info({ userId, baseUrl: cfg.baseUrl }, 'asi user exists');
  return { exists: true, user: found };
}

export async function createUser(cfg: AsiConfig, payload: AsiUser): Promise<AsiUser> {
  const url = buildUrl(cfg, '/cgi-bin/AccessUser.cgi', {
    action: 'insertMulti',
    format: 'json',
  });

  const body = { UserList: [buildUserPayload(payload)] };
  const res = await fetchWithRetry(url.toString(), {
    method: 'POST',
    headers: defaultHeaders(cfg, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });

  if (res.status === 409) {
    logger.warn({ userId: payload.userId, baseUrl: cfg.baseUrl }, 'asi createUser duplicate');
    return payload;
  }

  if (!res.ok) {
    const { raw } = await parseJsonResponse(res).catch(async () => ({ raw: await res.text() }));
    logger.warn(
      {
        userId: payload.userId,
        baseUrl: cfg.baseUrl,
        status: res.status,
        token: maskSensitive(cfg.token),
        body: raw?.slice?.(0, 400),
      },
      'asi createUser failed',
    );
    if (res.status >= 400 && res.status < 500) {
      throw new Error(`createUser validation failed (${res.status})`);
    }
    throw new Error(`createUser failed with status ${res.status}`);
  }

  const { data } = await parseJsonResponse(res).catch(() => ({ data: null }));
  if (data) {
    const list = extractUserList(data);
    const created = list
      .map((item) => toAsiUser(item))
      .find((user): user is AsiUser => !!user && user.userId === payload.userId);
    if (created) {
      logger.info({ userId: payload.userId, baseUrl: cfg.baseUrl }, 'asi user created');
      return created;
    }
  }

  logger.info({ userId: payload.userId, baseUrl: cfg.baseUrl }, 'asi user created (no payload)');
  return payload;
}

function extractFaceResult(data: any): any[] {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data)) return data;
  const candidates = [
    data.FaceList,
    data.faceList,
    data.RetList,
    data.retList,
    data.Data,
    data.data,
  ];
  for (const entry of candidates) {
    if (Array.isArray(entry)) return entry;
    if (entry && typeof entry === 'object') {
      const inner = extractFaceResult(entry);
      if (inner.length) return inner;
    }
  }
  return [];
}

function isFaceDuplicate(result: any): boolean {
  const code = result?.Ret ?? result?.ret ?? result?.Code ?? result?.code;
  const desc = String(result?.Description ?? result?.desc ?? '').toLowerCase();
  return code === 8 || code === '8' || desc.includes('exist');
}

function isFaceSuccess(result: any): boolean {
  const code = result?.Ret ?? result?.ret ?? result?.Code ?? result?.code ?? result?.Status;
  if (typeof code === 'string') {
    const normalized = code.toLowerCase();
    return normalized === 'ok' || normalized === '0' || normalized === 'success';
  }
  return code === 0 || code === undefined;
}

export async function insertUserFace(
  cfg: AsiConfig,
  userId: string,
  faceBase64: string,
): Promise<void> {
  const url = buildUrl(cfg, '/cgi-bin/AccessFace.cgi', {
    action: 'insertMulti',
  });

  const body = {
    FaceList: [
      {
        UserID: userId,
        PhotoData: [faceBase64],
      },
    ],
  };

  const res = await fetchWithRetry(url.toString(), {
    method: 'POST',
    headers: defaultHeaders(cfg, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });

  if (res.status === 409) {
    logger.info({ userId, baseUrl: cfg.baseUrl }, 'asi insertUserFace duplicate (409)');
    return;
  }

  if (!res.ok) {
    const { raw } = await parseJsonResponse(res).catch(async () => ({ raw: await res.text() }));
    logger.error(
      {
        userId,
        baseUrl: cfg.baseUrl,
        status: res.status,
        token: maskSensitive(cfg.token),
        body: raw?.slice?.(0, 400),
      },
      'asi insertUserFace failed',
    );
    if (res.status >= 400 && res.status < 500) {
      throw new Error(`insertUserFace validation failed (${res.status})`);
    }
    throw new Error(`insertUserFace failed with status ${res.status}`);
  }

  const { data } = await parseJsonResponse(res).catch(() => ({ data: null }));
  if (!data) {
    logger.info({ userId, baseUrl: cfg.baseUrl }, 'asi insertUserFace success (no payload)');
    return;
  }

  const results = extractFaceResult(data);
  if (!results.length) {
    logger.info({ userId, baseUrl: cfg.baseUrl }, 'asi insertUserFace success');
    return;
  }

  const first = results[0];
  if (isFaceSuccess(first)) {
    logger.info({ userId, baseUrl: cfg.baseUrl }, 'asi insertUserFace success');
    return;
  }

  if (isFaceDuplicate(first)) {
    logger.info({ userId, baseUrl: cfg.baseUrl }, 'asi insertUserFace duplicate');
    return;
  }

  logger.error({ userId, baseUrl: cfg.baseUrl, result: first }, 'asi insertUserFace returned error');
  throw new Error('insertUserFace failed with error result');
}
