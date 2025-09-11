# Giai đoạn 1: xây dựng mã nguồn và biên dịch TypeScript
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json .
COPY src src
RUN npm install && npm run build

# Giai đoạn 2: chạy ứng dụng Node.js đã biên dịch
FROM node:20-alpine AS run
WORKDIR /app
COPY --from=build /app/dist dist
COPY package*.json .
RUN npm install --omit=dev
CMD ["node", "dist/index.js"]
