#!/bin/bash

docker-compose down
docker-compose build --no-cache
docker-compose up -d

echo "Backend deployed on Synology NAS"
echo "API: http://192.168.1.200:8084"
echo "Swagger: http://192.168.1.200:8084/swagger"