import { beforeEach, describe, expect, it, vi } from 'vitest';

const registerDeviceMock = vi.fn();
const listDevicesMock = vi.fn();
const updateDeviceMock = vi.fn();
const removeDeviceMock = vi.fn();
const getDeviceMock = vi.fn();
const pingDeviceMock = vi.fn();

vi.mock('../src/devices/device-service.js', () => ({
  registerDevice: registerDeviceMock,
  listDevices: listDevicesMock,
  updateDevice: updateDeviceMock,
  removeDevice: removeDeviceMock,
  getDevice: getDeviceMock,
  pingDevice: pingDeviceMock,
}));

beforeEach(() => {
  registerDeviceMock.mockReset();
  listDevicesMock.mockReset();
  updateDeviceMock.mockReset();
  removeDeviceMock.mockReset();
  getDeviceMock.mockReset();
  pingDeviceMock.mockReset();
  vi.resetModules();
  process.env.CMS_ENDPOINT = 'http://cms';
  process.env.CMS_HMAC_KEY = 'key';
});

describe('device routes', () => {
  it('lists devices', async () => {
    listDevicesMock.mockResolvedValue([{ id: '1' }]);
    const { buildServer } = await import('../src/index.js');
    const app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/devices' });
    expect(res.statusCode).toBe(200);
    expect(listDevicesMock).toHaveBeenCalled();
    expect(res.json()).toEqual([{ id: '1' }]);
  });

  it('creates a device', async () => {
    const payload = { name: 'D1', ip: '1.2.3.4', username: 'u', password: 'p' };
    registerDeviceMock.mockResolvedValue({ id: '1', ...payload });
    const { buildServer } = await import('../src/index.js');
    const app = await buildServer();
    const res = await app.inject({ method: 'POST', url: '/devices', payload });
    expect(res.statusCode).toBe(201);
    expect(registerDeviceMock).toHaveBeenCalledWith(payload);
    expect(res.json()).toEqual({ id: '1', ...payload });
  });

  it('updates a device', async () => {
    updateDeviceMock.mockResolvedValue({ id: '1', name: 'D2' });
    const { buildServer } = await import('../src/index.js');
    const app = await buildServer();
    const res = await app.inject({ method: 'PATCH', url: '/devices/1', payload: { name: 'D2' } });
    expect(res.statusCode).toBe(200);
    expect(updateDeviceMock).toHaveBeenCalledWith('1', { name: 'D2' });
    expect(res.json()).toEqual({ id: '1', name: 'D2' });
  });

  it('deletes a device', async () => {
    const { buildServer } = await import('../src/index.js');
    const app = await buildServer();
    const res = await app.inject({ method: 'DELETE', url: '/devices/1' });
    expect(res.statusCode).toBe(204);
    expect(removeDeviceMock).toHaveBeenCalledWith('1');
  });

  it('tests device connection', async () => {
    getDeviceMock.mockResolvedValue({ id: '1' });
    pingDeviceMock.mockResolvedValue(true);
    const { buildServer } = await import('../src/index.js');
    const app = await buildServer();
    const res = await app.inject({ method: 'POST', url: '/devices/1/test-connection' });
    expect(res.statusCode).toBe(200);
    expect(getDeviceMock).toHaveBeenCalledWith('1');
    expect(pingDeviceMock).toHaveBeenCalled();
    expect(res.json()).toEqual({ ok: true });
  });
});

