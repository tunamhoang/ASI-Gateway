import { config } from 'dotenv';
config();

export const env = {
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '0.0.0.0',
  cmsEndpoint: process.env.CMS_ENDPOINT || '',
  cmsHmacKey: process.env.CMS_HMAC_KEY || '',
};
