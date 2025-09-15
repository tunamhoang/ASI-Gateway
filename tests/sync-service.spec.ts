import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { syncUsersToAsi, syncToDevice } from '../src/users/sync-service.js';

beforeEach(() => {
  fetch.mockReset();
});

describe('syncUsersToAsi', () => {
  it('processes multiple devices in parallel', async () => {
    fetch.mockImplementation(
      () => new Promise((res) => setTimeout(() => res({ ok: true }), 50)),
    );
    const users = [{ userId: '1', name: 'A', faceImageBase64: 'eA==' }];
    const start = Date.now();
    await syncUsersToAsi(users);
    const duration = Date.now() - start;
    expect(fetch.mock.calls.length).toBe(4);
    expect(duration).toBeLessThan(150);
  });
});

describe('syncToDevice', () => {
  it('batches and sends face requests with a concurrency limit', async () => {
    fetch.mockImplementation(
      () => new Promise((res) => setTimeout(() => res({ ok: true }), 50)),
    );
    const device = {
      ip: '1.2.3.4',
      port: 80,
      username: 'u',
      password: 'p',
      https: false,
    };
    const users = Array.from({ length: 4 }, (_, i) => ({
      userId: String(i),
      name: `U${i}`,
      faceImageBase64: 'eA==',
    }));
    const start = Date.now();
    await syncToDevice(device, users, 2);
    const duration = Date.now() - start;
    expect(fetch.mock.calls.length).toBe(5);
    expect(duration).toBeLessThan(220);
    const insertBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(insertBody.UserData).toHaveLength(4);
  });
});
