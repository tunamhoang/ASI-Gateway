import { createHmac } from 'crypto';

export function hmacSign(body: string, key: string): string {
  return createHmac('sha256', key).update(body).digest('hex');
}
