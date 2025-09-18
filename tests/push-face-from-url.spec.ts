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
    const jpegBase64 = '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpAB//Z';
    const jpegBuffer = Buffer.from(jpegBase64, 'base64');
    fetchBufferWithRetry.mockResolvedValue(jpegBuffer);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('OK'),
    });
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
      Info: { UserName: 'U1', PhotoData: [jpegBase64] },
    });
  });

  it('logs warning when upload fails', async () => {
    const jpegBase64 = '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpAB//Z';
    fetchBufferWithRetry.mockResolvedValue(Buffer.from(jpegBase64, 'base64'));
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
