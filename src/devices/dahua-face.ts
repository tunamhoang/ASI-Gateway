import { AsiConfig } from '../asi/client.js';

export interface DahuaFaceDevice {
  id?: string | number;
  ip: string;
  port?: number;
  https?: boolean;
  username?: string;
  password?: string;
  apiToken?: string;
}

function normalizePort(device: DahuaFaceDevice): number | undefined {
  if (typeof device.port === 'number' && !Number.isNaN(device.port)) {
    return device.port;
  }
  if (device.https) return 443;
  return 80;
}

export function maskToken(token: string | undefined): string | undefined {
  if (!token) return token;
  if (token.length <= 4) return '***';
  return `${token.slice(0, 2)}***${token.slice(-2)}`;
}

export function buildAsiConfig(device: DahuaFaceDevice): AsiConfig {
  const port = normalizePort(device);
  const scheme = device.https ? 'https' : 'http';
  const host = port ? `${device.ip}:${port}` : device.ip;
  const baseUrl = `${scheme}://${host}`;

  if (device.apiToken) {
    return { baseUrl, token: device.apiToken };
  }

  const user = device.username ?? '';
  const pass = device.password ?? '';
  const credential = `${user}:${pass}`;
  return { baseUrl, token: credential };
}
