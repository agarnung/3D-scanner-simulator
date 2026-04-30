#!/bin/bash
set -e

CONTAINER_NAME="3d-scanner-simulator-container"
IMAGE_NAME="3d-scanner-simulator-image"

# Hacer start.sh idempotente: si ya existe un contenedor con ese nombre,
# eliminarlo antes de arrancar uno nuevo.
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

docker build -f Dockerfile -t "$IMAGE_NAME" .
docker run -d --name "$CONTAINER_NAME" -p 8123:8123 "$IMAGE_NAME"
docker logs -f "$CONTAINER_NAME"

docker build -f Dockerfile -t 3d-scanner-simulator-image .
docker run -d --name 3d-scanner-simulator-container -p 8123:8123 3d-scanner-simulator-image
docker logs -f 3d-scanner-simulator-container