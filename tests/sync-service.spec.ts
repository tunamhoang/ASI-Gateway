import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import sharp from 'sharp';

const fetch = vi.fn();
vi.stubGlobal('fetch', fetch);

vi.mock('../src/devices/index.js', () => ({
  listDevices: vi.fn(() =>
    Promise.resolve([
      { ip: '1.1.1.1', port: 80, username: 'u', password: 'p', https: false },
      { ip: '2.2.2.2', port: 80, username: 'u', password: 'p', https: false },
    ]),
  ),
}));


const dahuaFaceMock = vi.hoisted(() => ({
  upsertFace: vi.fn(),
}));

vi.mock('../src/devices/dahua-face.js', () => dahuaFaceMock);


import { syncUsersToAsi, syncToDevice, upsertFace } from '../src/users/sync-service.js';
import { logger } from '../src/core/logger.js';

const deviceUpsertFace = dahuaFaceMock.upsertFace;

beforeEach(() => {
  fetch.mockReset();
  deviceUpsertFace.mockReset();
});

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

describe('syncUsersToAsi', () => {
  it('processes multiple devices in parallel', async () => {
    fetch.mockImplementation(
      () =>
        new Promise((res) =>
          setTimeout(
            () =>
              res({
                ok: true,
                status: 200,
                text: () => Promise.resolve('OK'),
              }),
            50,
          ),
        ),
    );

    deviceUpsertFace.mockImplementation(
      () =>
        new Promise((res) =>
          setTimeout(() => res('added'), 50),
        ),
    );

    const users = [{ userId: '1', name: 'A', faceImageBase64: jpegBase64 }];
    const start = Date.now();
    await syncUsersToAsi(users);
    const duration = Date.now() - start;
    expect(fetch.mock.calls.length).toBe(2);
    expect(deviceUpsertFace).toHaveBeenCalledTimes(2);
    expect(duration).toBeLessThan(150);
  });
});

describe('syncToDevice', () => {
  it('batches and sends face requests with a concurrency limit', async () => {
    fetch.mockImplementation(
      () =>
        new Promise((res) =>
          setTimeout(
            () =>
              res({
                ok: true,
                status: 200,
                text: () => Promise.resolve('OK'),
              }),
            50,
          ),
        ),

    );
    deviceUpsertFace.mockImplementation(
      () =>
        new Promise((res) =>
          setTimeout(() => res('added'), 50),
        ),

    );
    const device = {
      ip: '1.2.3.4',
      port: 80,
      username: 'u',
      password: 'p',
      https: false,
    };
    const jpegBase64 = '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpAB//Z';
    const users = Array.from({ length: 4 }, (_, i) => ({
      userId: String(i),
      name: `U${i}`,
      faceImageBase64: jpegBase64,
    }));
    const start = Date.now();
    await syncToDevice(device, users, 2);
    const duration = Date.now() - start;
    expect(fetch.mock.calls.length).toBe(1);
    expect(deviceUpsertFace).toHaveBeenCalledTimes(4);
    expect(duration).toBeLessThan(220);
    const insertBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(insertBody.UserData).toHaveLength(4);
  });
});

describe('upsertFace validation', () => {
  const device = {
    id: 'd1',
    ip: '1.2.3.4',
    port: 80,
    username: 'u',
    password: 'p',
    https: false,
  };

  it('warns and skips when userId is empty', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});


    await upsertFace(device, '', jpegBase64, 'Name');
    expect(warn).toHaveBeenCalled();
    expect(deviceUpsertFace).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns and skips when photoBase64 is invalid', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    await upsertFace(device, '1', 'notBase64', 'Name');

    expect(warn).toHaveBeenCalledWith(
      { deviceId: device.id, userId: '1' },
      'upsertFace skipped: photo not JPEG',
    );
    expect(deviceUpsertFace).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('warns and skips when photoBase64 is empty', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    await upsertFace(device, '1', '', 'Name');

    expect(warn).toHaveBeenCalled();
    expect(deviceUpsertFace).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it('warns and skips when name is missing', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    await upsertFace(device, '1', jpegBase64);

    expect(warn).toHaveBeenCalledWith(
      { deviceId: device.id, userId: '1', issues: ['name required'] },
      'upsertFace skipped: invalid face payload',
    );
    expect(deviceUpsertFace).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it('normalizes and forwards base64 with whitespace', async () => {
    deviceUpsertFace.mockResolvedValueOnce('added');
    await upsertFace(device, '1', `${jpegBase64}\n  `, 'Name');

    expect(deviceUpsertFace).toHaveBeenCalledTimes(1);
    const [, payload] = deviceUpsertFace.mock.calls[0];
    expect(payload).toEqual({ userId: '1', userName: 'Name', photoBase64: jpegBase64 });
  });
  it('warns and skips when photoBase64 is not JPEG', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    await upsertFace(device, '1', Buffer.from('hello').toString('base64'), 'Name');
    expect(warn).toHaveBeenCalled();

    expect(deviceUpsertFace).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns and skips when photo dimensions exceed 2000px', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const bigBuffer = await sharp({
      create: {
        width: 2001,
        height: 500,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();
    await upsertFace(device, '1', bigBuffer.toString('base64'), 'Name');
    expect(warn).toHaveBeenCalled();
    expect(deviceUpsertFace).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it('warns and skips when photoBase64 exceeds 200k characters', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const longBase64 = 'A'.repeat(200_001);
    await upsertFace(device, '1', longBase64, 'Name');
    expect(warn).toHaveBeenCalledWith(
      { deviceId: device.id, userId: '1' },
      'upsertFace skipped: photo not JPEG',
    );
    expect(deviceUpsertFace).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it('warns and skips when photoBase64 has invalid characters', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    await upsertFace(device, '1', 'abcd!', 'Name');
    expect(warn).toHaveBeenCalledWith(
      { deviceId: device.id, userId: '1', issues: ['face_image_b64 contains invalid base64 characters'] },
      'upsertFace skipped: invalid face payload',
    );
    expect(deviceUpsertFace).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('forwards payload to dahua upsert helper', async () => {
    deviceUpsertFace.mockResolvedValueOnce('added');
    await upsertFace(device, '1', `${jpegBase64}   `, 'Name');
    expect(deviceUpsertFace).toHaveBeenCalledTimes(1);
    const [conn, payload] = deviceUpsertFace.mock.calls[0];
    expect(conn).toEqual({ host: '1.2.3.4:80', user: 'u', pass: 'p', scheme: 'http' });
    expect(payload).toEqual({ userId: '1', userName: 'Name', photoBase64: jpegBase64 });

  });
});
