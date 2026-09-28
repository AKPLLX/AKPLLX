FROM node:20-alpine

ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata

WORKDIR /app

COPY package*.json ./
RUN npm config set registry https://mirrors.cloud.tencent.com/npm/ && npm install

COPY . .

EXPOSE 80

CMD ["npm", "start"]
