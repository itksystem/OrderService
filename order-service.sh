#!/bin/bash

# Название образа Docker
PORT=3006
SERVICE="order-service"
IMAGE_NAME="docker.io/itksystem/$SERVICE:latest"

# Остановить и удалить контейнер, если он уже запущен
echo "Остановка и удаление существующего контейнера..."
docker stop $SERVICE || true
docker rm $SERVICE || true

# Удаление локального образа Docker
echo "Удаление локального образа $IMAGE_NAME..."
docker rmi $IMAGE_NAME || true
# Загрузка образа из Docker Hub
echo "Загрузка образа $IMAGE_NAME из Docker Hub..."
docker pull $IMAGE_NAME

# Запуск нового контейнера
echo "Запуск нового контейнера..."

sudo docker run -d -t -i  \
--restart unless-stopped \
-p $PORT:$PORT \
--env-file .env-$SERVICE \
--name $SERVICE $IMAGE_NAME

echo "Контейнер успешно обновлен и запущен."
