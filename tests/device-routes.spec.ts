import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/devices/device-service.js', () => ({
  listDevices: vi.fn(),
  registerDevice: vi.fn(),
  updateDevice: vi.fn(),
  removeDevice: vi.fn(),
  refreshStatus: vi.fn(),
}));

import { buildServer } from '../src/index.js';
import {
  listDevices,
  registerDevice,
  updateDevice,
  removeDevice,
  refreshStatus,
} from '../src/devices/device-service.js';

let app: any;

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildServer();
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('GET /devices', () => {
  it('returns list of devices', async () => {
    (listDevices as any).mockResolvedValue([{ id: '1', name: 'd1' }]);
    const res = await app.inject({ method: 'GET', url: '/devices' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  it('handles service errors', async () => {
    (listDevices as any).mockRejectedValue(new Error('fail'));
    const res = await app.inject({ method: 'GET', url: '/devices' });
    expect(res.statusCode).toBe(500);
  });
});

describe('POST /devices', () => {
  it('registers a device', async () => {
    (registerDevice as any).mockResolvedValue({ id: '1', name: 'd1' });
    const res = await app.inject({
      method: 'POST',
      url: '/devices',
      payload: { name: 'd1', ip: '1.1.1.1', username: 'u', password: 'p' },
    });
    expect(res.statusCode).toBe(201);
    expect(registerDevice).toHaveBeenCalled();
  });

  it('validates body', async () => {
    const res = await app.inject({ method: 'POST', url: '/devices', payload: { name: 'd1' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /devices/:id', () => {
  it('updates a device', async () => {
    (updateDevice as any).mockResolvedValue({ id: '1', name: 'new' });
    const res = await app.inject({ method: 'PATCH', url: '/devices/1', payload: { name: 'new' } });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when not found', async () => {
    (updateDevice as any).mockRejectedValue(new Error('not found'));
    const res = await app.inject({ method: 'PATCH', url: '/devices/1', payload: { name: 'new' } });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /devices/:id', () => {
  it('removes a device', async () => {
    (removeDevice as any).mockResolvedValue({});
    const res = await app.inject({ method: 'DELETE', url: '/devices/1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when not found', async () => {
    (removeDevice as any).mockRejectedValue(new Error('not found'));
    const res = await app.inject({ method: 'DELETE', url: '/devices/1' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /devices/:id/test-connection', () => {
  it('tests connection and returns status', async () => {
    (refreshStatus as any).mockResolvedValue({ status: 'online' });
    const res = await app.inject({ method: 'POST', url: '/devices/1/test-connection' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'online' });
  });

  it('returns 404 when device not found', async () => {
    (refreshStatus as any).mockResolvedValue(null);
    const res = await app.inject({ method: 'POST', url: '/devices/1/test-connection' });
    expect(res.statusCode).toBe(404);
=======
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
