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

### Sync CMS employees to ASI devices

1. Set the CMS HRM variables in `.env`:
   - `CMS_HRM_ENDPOINT` – points to `GetEmployees`
   - `CMS_HRM_AUTH_HEADER` – authorization header if required
2. Register each ASI device via `POST /devices` with its connection details.
   ```bash
   curl -X POST http://<host>:<port>/devices \
     -H 'Content-Type: application/json' \
     -d '{
       "name": "Lobby",
       "ip": "10.0.0.5",
       "port": 80,
       "username": "admin",
       "password": "pass",
       "https": false
     }'
   ```
   Sample response:
   ```json
   {
     "id": "d123",
     "name": "Lobby",
     "ip": "10.0.0.5",
     "port": 80,
     "username": "admin",
     "password": "pass",
     "https": false,
     "status": "unknown",
     "lastSeenAt": null,
     "createdAt": "2024-01-01T00:00:00.000Z",
     "updatedAt": "2024-01-01T00:00:00.000Z"
   }
   ```
   Use `GET /devices` to view all registered devices:
   ```bash
   curl http://<host>:<port>/devices
   ```
3. Start the gateway:
   ```bash
   npm run dev
   ```
4. Trigger synchronization:
   ```bash
   curl -X POST http://<host>:<port>/cms/sync-employees
   ```
   Sample response:
   ```json
   {
     "status": "ok",
     "count": 2
   }
   ```
   Gateway downloads face images from the CMS, converts them to base64 and
   upserts users plus photos to every registered device.

### Configure Device Alarm Server

Point devices to `https://<gateway>/asi/webhook` with provided basic auth credentials.
