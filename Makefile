.PHONY: dev build start lint test docker

dev:
 npm run dev

build:
 npm run build

start:
 npm start

lint:
 npm run lint

test:
 npm test

docker:
 docker-compose up --build
