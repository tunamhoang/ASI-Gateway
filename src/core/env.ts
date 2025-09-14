import { config } from 'dotenv';
config();

export const env = {
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '0.0.0.0',
  cmsEndpoint: process.env.CMS_ENDPOINT || '',
  cmsHmacKey: process.env.CMS_HMAC_KEY || '',
  cmsHrmEndpoint: process.env.CMS_HRM_ENDPOINT || '',
  cmsHrmAuthHeader: process.env.CMS_HRM_AUTH_HEADER || '',
  inboundBasicUser: process.env.INBOUND_BASIC_USER || '',
  inboundBasicPass: process.env.INBOUND_BASIC_PASS || '',
  allowlistCidrs: (process.env.ALLOWLIST_CIDRS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
