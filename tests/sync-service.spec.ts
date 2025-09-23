import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

const asiClientMock = vi.hoisted(() => ({
  getUserById: vi.fn(),
  createUser: vi.fn(),
  insertUserFace: vi.fn(),
}));

vi.mock('../src/asi/client.js', () => asiClientMock);

const listDevicesMock = vi.hoisted(() => vi.fn());
vi.mock('../src/devices/index.js', () => ({
  listDevices: listDevicesMock,
}));

vi.mock('../src/core/http-limit.js', () => ({
  httpLimit: <T>(fn: () => Promise<T>) => fn(),
}));

const fetchBufferWithRetryMock = vi.hoisted(() => vi.fn());
vi.mock('../src/core/http-fetch.js', () => ({
  fetchBufferWithRetry: fetchBufferWithRetryMock,
}));

import {
  syncUsersToAsi,
  upsertUserAndFace,
  syncToDevice,
  pushFaceFromUrl,
} from '../src/users/sync-service.js';

const { getUserById, createUser, insertUserFace } = asiClientMock;

let jpegBase64: string;

beforeAll(async () => {
  const buf = await sharp({
    create: {
      width: 128,
      height: 128,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .jpeg()
    .toBuffer();
  jpegBase64 = buf.toString('base64');
});

beforeEach(() => {
  getUserById.mockReset();
  createUser.mockReset();
  insertUserFace.mockReset();
  listDevicesMock.mockReset();
  fetchBufferWithRetryMock.mockReset();
});

describe('upsertUserAndFace', () => {
  it('creates user when missing and inserts face', async () => {
    getUserById.mockResolvedValue({ exists: false });
    createUser.mockResolvedValue({ userId: '1', name: 'A' });
    insertUserFace.mockResolvedValue();

    const cfg = { baseUrl: 'http://device', token: 'token' };
    await upsertUserAndFace(cfg, {
      userId: '1',
      name: 'Alice',
      faceImageBase64: jpegBase64,
    });

    expect(getUserById).toHaveBeenCalledWith(cfg, '1');
    expect(createUser).toHaveBeenCalledWith(cfg, {
      userId: '1',
      name: 'Alice',
      citizenIdNo: undefined,
    });
    expect(insertUserFace).toHaveBeenCalledWith(cfg, '1', jpegBase64);
  });

  it('skips create when user already exists', async () => {
    getUserById.mockResolvedValue({ exists: true, user: { userId: '1', name: 'Alice' } });
    insertUserFace.mockResolvedValue();

    const cfg = { baseUrl: 'http://device', token: 'token' };
    await upsertUserAndFace(cfg, {
      userId: '1',
      name: 'Alice',
      faceImageBase64: jpegBase64,
    });

    expect(createUser).not.toHaveBeenCalled();
    expect(insertUserFace).toHaveBeenCalledWith(cfg, '1', jpegBase64);
  });
});

describe('syncToDevice', () => {
  it('processes users sequentially per concurrency limit', async () => {
    getUserById.mockResolvedValue({ exists: true });
    insertUserFace.mockResolvedValue();
    const device = { id: 'd1', ip: '1.2.3.4', port: 80, username: 'u', password: 'p' };
    const users = Array.from({ length: 3 }, (_, i) => ({
      userId: String(i),
      name: `User${i}`,
      faceImageBase64: jpegBase64,
    }));

    await syncToDevice(device, users, 2);

    expect(getUserById).toHaveBeenCalledTimes(3);
    expect(insertUserFace).toHaveBeenCalledTimes(3);
  });
});

describe('syncUsersToAsi', () => {
  it('syncs users across all devices', async () => {
    listDevicesMock.mockResolvedValue([
      { id: 'd1', ip: '1.1.1.1', port: 80, username: 'u', password: 'p' },
      { id: 'd2', ip: '2.2.2.2', port: 80, username: 'u', password: 'p' },
    ]);
    getUserById.mockResolvedValue({ exists: true });
    insertUserFace.mockResolvedValue();

    const users = [{ userId: '1', name: 'Alice', faceImageBase64: jpegBase64 }];
    await syncUsersToAsi(users, 2);

    expect(getUserById).toHaveBeenCalledTimes(2);
    expect(insertUserFace).toHaveBeenCalledTimes(2);
  });
});

describe('pushFaceFromUrl', () => {
  it('downloads face then upserts', async () => {
    fetchBufferWithRetryMock.mockResolvedValue(Buffer.from(jpegBase64, 'base64'));
    getUserById.mockResolvedValue({ exists: false });
    insertUserFace.mockResolvedValue();

    await pushFaceFromUrl(
      { id: 'd1', ip: '1.2.3.4', port: 80, username: 'u', password: 'p' },
      '1',
      'Alice',
      'http://image',
    );

    expect(fetchBufferWithRetryMock).toHaveBeenCalledWith('http://image', 3);
    expect(insertUserFace).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'http://1.2.3.4:80' }),
      '1',
      expect.any(String),
    );
  });
});
