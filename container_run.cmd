docker pull itksystem/order-service
docker run -d --name order-service --restart unless-stopped -p 3003:3003 --env-file .env.prod itksystem/order-service


