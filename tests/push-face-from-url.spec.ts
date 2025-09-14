import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
vi.mock('../src/core/http-fetch.js', () => ({
  fetchBufferWithRetry: vi.fn(),
}));

import { pushFaceFromUrl } from '../src/users/sync-service.js';
const { fetchBufferWithRetry } = await import('../src/core/http-fetch.js');
import { logger } from '../src/core/logger.js';

beforeEach(() => {
  fetchMock.mockReset();
  fetchBufferWithRetry.mockReset();
});

describe('pushFaceFromUrl', () => {
  it('sends base64 image to device', async () => {
    fetchBufferWithRetry.mockResolvedValue(Buffer.from('image'));
    fetchMock.mockResolvedValue({ ok: true });
    const device = {
      ip: '1.2.3.4',
      port: 80,
      username: 'u',
      password: 'p',
      https: false,
    };
    await pushFaceFromUrl(device, '1', 'U1', 'http://img');
    expect(fetchMock.mock.calls.length).toBe(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://1.2.3.4:80/cgi-bin/FaceInfoManager.cgi?action=add&format=json');
    const body = JSON.parse(opts.body);
    expect(body).toEqual({
      UserID: '1',
      Info: { UserName: 'U1', PhotoData: [Buffer.from('image').toString('base64')] },
    });
  });

  it('logs warning when upload fails', async () => {
    fetchBufferWithRetry.mockResolvedValue(Buffer.from('img'));
    fetchMock.mockRejectedValue(new Error('fail'));
    const device = {
      id: 'd1',
      ip: '1.2.3.4',
      port: 80,
      username: 'u',
      password: 'p',
      https: false,
    };
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    await pushFaceFromUrl(device, '1', 'U1', 'http://img');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
