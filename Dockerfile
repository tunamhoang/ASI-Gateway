# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app
# Prisma cần openssl trong Alpine
RUN apk add --no-cache openssl

# 1) Copy manifest + prisma trước để cache tốt
COPY package*.json ./
COPY prisma ./prisma

# 2) Cài deps (bao gồm @prisma/client)
RUN npm ci

# 3) Generate Prisma Client cho môi trường alpine
RUN npx prisma generate

# 4) Copy code và build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# (tuỳ) nếu muốn gọn hơn, có thể prune dev sau khi build
# RUN npm prune --omit=dev

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
