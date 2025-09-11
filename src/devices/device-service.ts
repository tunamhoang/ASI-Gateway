import fetch from 'node-fetch';
import { prisma } from '../core/prisma.js';
import { logger } from '../core/logger.js';

export interface DeviceInput {
  name: string;
  ip: string;
  port?: number;
  username: string;
  password: string;
  https?: boolean;
}

export async function registerDevice(data: DeviceInput) {
  return prisma.device.create({ data });
}

export async function listDevices() {
  return prisma.device.findMany();
}

export async function getDevice(id: string) {
  return prisma.device.findUnique({ where: { id } });
}

export async function updateDevice(id: string, data: Partial<DeviceInput>) {
  return prisma.device.update({ where: { id }, data });
}

export async function removeDevice(id: string) {
  return prisma.device.delete({ where: { id } });
}

export async function pingDevice(device: {
  ip: string;
  port: number;
  username: string;
  password: string;
  https: boolean;
}) {
  const scheme = device.https ? 'https' : 'http';
  const url = `${scheme}://${device.ip}:${device.port}/cgi-bin/magicBox.cgi?action=getDeviceType`;
  try {
    const res = await fetch(url, {
      timeout: 3000,
      headers: {
        Authorization:
          'Basic ' + Buffer.from(`${device.username}:${device.password}`).toString('base64'),
      },
    });
    return res.ok;
  } catch (err) {
    logger.warn({ err }, 'pingDevice failed');
    return false;
  }
}

export async function refreshStatus(id: string) {
  const device = await getDevice(id);
  if (!device) return null;
  const ok = await pingDevice(device);
  return prisma.device.update({
    where: { id },
    data: {
      status: ok ? 'online' : 'offline',
      lastSeenAt: ok ? new Date() : device.lastSeenAt,
    },
  });
}
