#!/usr/bin/env bash

POSTGRES_CONTAINER_NAME=postgresdb
NETWORK_NAME=lambda-local
DB_PORT=5432
DB_NAME=postgres
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=postgres

function cleanup(){
    echo "Cleaning up..."
    docker container stop ${POSTGRES_CONTAINER_NAME}
    docker rm ${POSTGRES_CONTAINER_NAME}
    docker network rm ${NETWORK_NAME}
}

docker network create ${NETWORK_NAME}
docker run \
    --name ${POSTGRES_CONTAINER_NAME} \
    --network ${NETWORK_NAME} \
    -e POSTGRES_USER=${DB_USER} -e POSTGRES_PASSWORD=${DB_PASSWORD} \
    -p ${DB_PORT}:5432 postgres

trap cleanup EXIT
