#!/usr/bin/env bash

docker build -t postgres . &&
docker run \
  --rm \
  -p 5432:5432 \
  --env POSTGRES_PASSWORD=postgres \
  --name postgres \
  postgres
