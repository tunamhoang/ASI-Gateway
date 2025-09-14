FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl ca-certificates && update-ca-certificates

# copy manifest + prisma trước
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

# build app
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
