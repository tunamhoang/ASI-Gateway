import { describe, it, expect } from 'vitest';

import { buildAsiConfig, maskToken } from '../src/devices/dahua-face.js';

describe('devices/dahua-face buildAsiConfig', () => {
  it('builds config using username/password when apiToken missing', () => {
    const cfg = buildAsiConfig({
      ip: '10.0.0.1',
      port: 8080,
      username: 'admin',
      password: 'pass',
    });

    expect(cfg.baseUrl).toBe('http://10.0.0.1:8080');
    expect(cfg.token).toBe('admin:pass');
  });

  it('uses apiToken when provided', () => {
    const cfg = buildAsiConfig({
      ip: '10.0.0.1',
      https: true,
      apiToken: 'Bearer abc',
    });

    expect(cfg.baseUrl).toBe('https://10.0.0.1:443');
    expect(cfg.token).toBe('Bearer abc');
  });
});

describe('devices/dahua-face maskToken', () => {
  it('masks long tokens', () => {
    expect(maskToken('supersecrettoken')).toBe('su***en');
  });

  it('masks short tokens', () => {
    expect(maskToken('abc')).toBe('***');
  });
});
