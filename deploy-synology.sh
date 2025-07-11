docker-compose down
docker-compose build --no-cache
docker-compose up -d

echo "Backend deployed on Synology NAS"
echo "API: http://14.224.212.102:8084"
echo "Swagger: http://14.224.212.102:8084/swagger"