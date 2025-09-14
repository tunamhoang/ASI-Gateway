import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/alarms/tcp-listener', () => ({
  startAlarmTcpServer: vi.fn(),
}));

const devices = vi.hoisted(() => [] as any[]);

vi.mock('../src/devices/device-service.js', () => {
  const pingDevice = vi.fn(async () => true);
  return {
    registerDevice: vi.fn(async (data) => {
      const dev = { id: String(devices.length + 1), port: 80, https: false, ...data };
      devices.push(dev);
      return dev;
    }),
    listDevices: vi.fn(async () => devices),
    updateDevice: vi.fn(async (id, data) => {
      const d = devices.find((x) => x.id === id)!;
      Object.assign(d, data);
      return d;
    }),
    removeDevice: vi.fn(async (id) => {
      const idx = devices.findIndex((x) => x.id === id);
      if (idx >= 0) devices.splice(idx, 1);
    }),
    getDevice: vi.fn(async (id) => devices.find((x) => x.id === id) || null),
    pingDevice,
    __devices: devices,
  };
});

import { buildServer } from '../src/index.js';
import { __devices, pingDevice } from '../src/devices/device-service.js';

beforeEach(() => {
  __devices.length = 0;
  pingDevice.mockReset();
  pingDevice.mockResolvedValue(true);
});

describe('device routes', () => {
  it('creates, lists, updates, pings, and deletes devices', async () => {
    const app = await buildServer();

    const create = await app.inject({
      method: 'POST',
      url: '/devices',
      payload: {
        name: 'Cam1',
        ip: '1.2.3.4',
        username: 'u',
        password: 'p',
      },
    });
    expect(create.statusCode).toBe(201);
    const dev = create.json();

    const list = await app.inject({ method: 'GET', url: '/devices' });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);

    const upd = await app.inject({
      method: 'PATCH',
      url: `/devices/${dev.id}`,
      payload: { name: 'Cam2' },
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json().name).toBe('Cam2');

    const ping = await app.inject({
      method: 'POST',
      url: `/devices/${dev.id}/test-connection`,
    });
    expect(ping.statusCode).toBe(200);
    expect(ping.json().ok).toBe(true);

    const del = await app.inject({
      method: 'DELETE',
      url: `/devices/${dev.id}`,
    });
    expect(del.statusCode).toBe(204);

    const list2 = await app.inject({ method: 'GET', url: '/devices' });
    expect(list2.json()).toHaveLength(0);
  });

  it('rejects invalid input', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/devices',
      payload: { name: 'Bad' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('handles unreachable device on ping', async () => {
    const app = await buildServer();
    const create = await app.inject({
      method: 'POST',
      url: '/devices',
      payload: {
        name: 'Cam1',
        ip: '1.2.3.4',
        username: 'u',
        password: 'p',
      },
    });
    const dev = create.json();
    pingDevice.mockResolvedValueOnce(false);
    const ping = await app.inject({
      method: 'POST',
      url: `/devices/${dev.id}/test-connection`,
    });
    expect(ping.statusCode).toBe(200);
    expect(ping.json().ok).toBe(false);
  });
});
