import { config } from 'dotenv';
config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '0.0.0.0',
  cmsEndpoint: requireEnv('CMS_ENDPOINT'),
  cmsHmacKey: requireEnv('CMS_HMAC_KEY'),
  cmsHrmEndpoint: requireEnv('CMS_HRM_ENDPOINT'),
  cmsHrmAuthHeader: requireEnv('CMS_HRM_AUTH_HEADER'),
};
