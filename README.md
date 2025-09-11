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

### CMS HRM API

Gateway fetches employee data from the CMS via the following endpoint:

```bash
curl -X 'GET' \
  'https://dev.api.hrm.unicloudgroup.com.vn/api/v1/faceid/GetEmployees' \
  -H 'accept: application/json'
```

Example response:

```json
{
  "userId": "111de5d7-ebef-4f0e-8656-7e13f58af396",
  "card_number": null,
  "fullName": "Phan Thành Đạt",
  "faceUrl": "https://firebasestorage.googleapis.com/v0/b/sunshine-app-production.appspot.com/o/users%2F111de5d7-ebef-4f0e-8656-7e13f58af396%2F914622c0-d35f-11ed-b40f-7bdc76a0edf5?alt=media&token=1e44183e-491b-45cc-9167-a47adce68181"
}
```

### Configure Device Alarm Server

Point devices to `https://<gateway>/asi/webhook` with provided basic auth credentials.
