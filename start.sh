#!/bin/bash

docker build -f Dockerfile -t 3d-scanner-simulator-image .
docker run -d --name 3d-scanner-simulator-container -p 8123:8123 3d-scanner-simulator-image
docker logs -f 3d-scanner-simulator-container