#!/usr/bin/env bash

POSTGRES_CONTAINER_NAME=postgresdb
NETWORK_NAME=lambda-local
DB_PORT=5432
DB_NAME=postgres
DB_HOST=localhost
DB_USER=postgres

NODE_ENV=dev \
DB_NAME=${DB_NAME} \
DB_PORT=${DB_PORT} \
DB_HOST=${DB_HOST} \
DB_USER=${DB_USER} \
node lambda/index.js
#sam local start-api --docker-network ${NETWORK_NAME}
