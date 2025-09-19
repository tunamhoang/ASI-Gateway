import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import sharp from 'sharp';

vi.mock('../src/core/http-fetch.js', () => ({
  fetchBufferWithRetry: vi.fn(),
}));

const dahuaFaceMock = vi.hoisted(() => ({
  upsertFace: vi.fn(),
}));

vi.mock('../src/devices/dahua-face.js', () => dahuaFaceMock);

import { pushFaceFromUrl } from '../src/users/sync-service.js';
const { fetchBufferWithRetry } = await import('../src/core/http-fetch.js');
import { logger } from '../src/core/logger.js';

const deviceUpsertFace = dahuaFaceMock.upsertFace;

let jpegBase64: string;

beforeAll(async () => {
  const buf = await sharp({
    create: {
      width: 320,
      height: 320,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .jpeg()
    .toBuffer();
  jpegBase64 = buf.toString('base64');
});

beforeEach(() => {
  deviceUpsertFace.mockReset();
  fetchBufferWithRetry.mockReset();
});

describe('pushFaceFromUrl', () => {
  it('sends base64 image to device', async () => {

    const jpegBuffer = Buffer.from(jpegBase64, 'base64');
    fetchBufferWithRetry.mockResolvedValue(jpegBuffer);
    deviceUpsertFace.mockResolvedValue('added');

    const device = {
      ip: '1.2.3.4',
      port: 80,
      username: 'u',
      password: 'p',
      https: false,
    };
    await pushFaceFromUrl(device, '1', 'U1', 'http://img');

    expect(deviceUpsertFace).toHaveBeenCalledTimes(1);
    const [conn, payload] = deviceUpsertFace.mock.calls[0];
    expect(conn).toEqual({ host: '1.2.3.4:80', user: 'u', pass: 'p', scheme: 'http' });
    expect(payload).toEqual({ userId: '1', userName: 'U1', photoBase64: jpegBase64 });
  });

  it('logs warning when upload fails', async () => {
    fetchBufferWithRetry.mockResolvedValue(Buffer.from(jpegBase64, 'base64'));
    deviceUpsertFace.mockRejectedValue(new Error('fail'));

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
