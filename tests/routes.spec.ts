import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
vi.mock('node-fetch', () => ({ default: fetchMock }));

const syncUsersToAsiMock = vi.fn();
vi.mock('../src/users/sync-service.js', () => ({
  syncUsersToAsi: syncUsersToAsiMock,
}));

beforeEach(() => {
  fetchMock.mockReset();
  syncUsersToAsiMock.mockReset();
  vi.resetModules();
  delete process.env.CMS_ENDPOINT;
  delete process.env.CMS_HMAC_KEY;
  delete process.env.INBOUND_BASIC_USER;
  delete process.env.INBOUND_BASIC_PASS;
  delete process.env.ALLOWLIST_CIDRS;
});

describe('POST /users/sync', () => {
  it('calls syncUsersToAsi with provided users', async () => {
    process.env.CMS_ENDPOINT = '';
    process.env.CMS_HMAC_KEY = '';
    const { buildServer } = await import('../src/index.js');
    const app = await buildServer();
    const users = [{ userId: '1', name: 'A' }];
    const res = await app.inject({
      method: 'POST',
      url: '/users/sync',
      payload: users,
    });
    expect(res.statusCode).toBe(200);
    expect(syncUsersToAsiMock).toHaveBeenCalledWith(users);
  });
});

describe('POST /asi/webhook', () => {
  it('forwards payload to CMS with HMAC and basic auth', async () => {
    process.env.CMS_ENDPOINT = 'https://cms.example.com/hook';
    process.env.CMS_HMAC_KEY = 'secret';
    process.env.INBOUND_BASIC_USER = 'asi';
    process.env.INBOUND_BASIC_PASS = 'pass';
    process.env.ALLOWLIST_CIDRS = '127.0.0.1/32';
    const { buildServer } = await import('../src/index.js');
    const app = await buildServer();
    fetchMock.mockResolvedValue({ ok: true });
    const payload = { event: 'hi' };
    const auth = 'Basic ' + Buffer.from('asi:pass').toString('base64');
    const res = await app.inject({
      method: 'POST',
      url: '/asi/webhook',
      payload,
      headers: { authorization: auth },
    });
    expect(res.statusCode).toBe(200);
    const { hmacSign } = await import('../src/core/hmac.js');
    const sig = hmacSign(JSON.stringify(payload), 'secret');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cms.example.com/hook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Signature': sig,
        }),
        body: JSON.stringify(payload),
      }),
    );
  });
});

