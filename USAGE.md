# Hướng dẫn sử dụng

## Kết nối ASI

- Đăng ký thiết bị qua API `POST /devices` với địa chỉ IP, cổng và thông tin đăng nhập.
- Có thể kiểm tra lại danh sách thiết bị bằng `GET /devices`.

## Tích hợp CMS

- Cấu hình các biến môi trường `CMS_ENDPOINT`, `CMS_HMAC_KEY`, `CMS_HRM_ENDPOINT`, `CMS_HRM_AUTH_HEADER`.
- Sau khi khởi động gateway, gọi `POST /cms/sync-employees` để đồng bộ nhân viên từ CMS sang các thiết bị ASI.

## Câu lệnh sử dụng

- Chạy ở chế độ phát triển: `npm run dev`
- Build dự án: `npm run build`
- Khởi động từ bản build: `npm start`
- Đồng bộ nhân viên: `curl -X POST http://<host>:<port>/cms/sync-employees`

## API và cách dùng

- Tài liệu OpenAPI có tại đường dẫn `/docs` khi dịch vụ chạy.
- Các API chính:
  - `POST /devices` đăng ký thiết bị ASI.
  - `GET /devices` liệt kê thiết bị.
  - `POST /cms/sync-employees` đồng bộ nhân viên từ CMS.
  - Webhook sự kiện từ thiết bị: `POST /asi/webhook`.
