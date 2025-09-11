import { describe, it, expect, vi } from 'vitest';
import { pingDevice } from '../src/devices/device-service.js';

vi.mock('node-fetch', () => ({
  default: vi.fn(() => Promise.resolve({ ok: true }))
}));

describe('pingDevice', () => {
  const device = {
    ip: '1.2.3.4',
    port: 80,
    username: 'admin',
    password: 'pass',
    https: false,
  };

  it('returns true when device responds', async () => {
    const result = await pingDevice(device);
    expect(result).toBe(true);
  });

  it('returns false when fetch fails', async () => {
    const fetch = (await import('node-fetch')).default as any;
    fetch.mockImplementationOnce(() => Promise.reject(new Error('fail')));
    const result = await pingDevice(device);
    expect(result).toBe(false);
  });
});
