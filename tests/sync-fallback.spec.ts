import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/cms/hrm-client.js', () => ({
  fetchEmployees: vi.fn(() => Promise.resolve([{ EmployeeID: 1, FullName: 'A' }]))
}));

vi.mock('../src/devices/index.js', () => ({
  listDevices: vi.fn(() => Promise.reject(new Error('db down')))
}));

import { buildServer } from '../src/index.js';

describe('POST /cms/sync-employees fallback', () => {
  it('returns 503 when device listing fails', async () => {
    const app = await buildServer();
    const res = await app.inject({ method: 'POST', url: '/cms/sync-employees' });
    expect(res.statusCode).toBe(503);
  });
});
