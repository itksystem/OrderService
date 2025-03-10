# Указываем базовый образ Node.js
FROM node:18-alpine
RUN apk add --no-cache bash
RUN apk add --no-cache mc

# Устанавливаем рабочую директорию в контейнере
WORKDIR /usr/src/app

# Копируем файлы package.json и package-lock.json для установки зависимостей
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем все файлы приложения в контейнер
COPY . .

# Указываем порт, на котором приложение будет доступно
EXPOSE 3003

# Устанавливаем переменные окружения (например, для использования .env)
# Если используется файл .env, убедитесь, что он подключен правильно в коде.
# CMD ["npm", "start"] предполагает, что в package.json есть команда "start"
CMD ["node", "app.js"]