# ASI Gateway

Gateway service bridging enterprise HR/CMS systems with Dahua ASI standalone devices.

## Features

- Batch user synchronization with face image upload
- Real-time event relay from device to CMS via HMAC-signed webhook
- Device registry with health checks
- Fallback log polling job
- HTTPS support with optional mTLS

## Development

```bash
npm install
npm run dev
```

API documentation available via OpenAPI at `/docs` when the server is running.

### User Sync Example

```json
[
  {
    "userId": "u1",
    "name": "Alice",
    "faceImageBase64": "<base64>"
  }
]
```

### Configure Device Alarm Server

Point devices to `https://<gateway>/asi/webhook` with provided basic auth credentials.
