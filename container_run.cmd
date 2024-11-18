docker pull itksystem/warehouse-service
docker run -d --name warehouse-service --restart unless-stopped -p 3002:3002 --env-file .env.prod itksystem/warehouse-service


