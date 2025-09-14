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
  });
});
