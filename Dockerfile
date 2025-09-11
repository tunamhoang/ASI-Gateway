# Stage 1: build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json .
COPY src src
RUN npm install && npm run build

# Stage 2: run
FROM node:20-alpine AS run
WORKDIR /app
COPY --from=build /app/dist dist
COPY package*.json .
RUN npm install --omit=dev
CMD ["node", "dist/index.js"]
