
# Image légère avec Node.js
FROM node:20-alpine
 
WORKDIR /app

COPY package.json package-lock.json ./

COPY server/package.json ./server/package.json
COPY shared/package.json ./shared/package.json

RUN npm ci

COPY shared ./shared
COPY server ./server

RUN npm run build --workspace=@bomberman-area/shared
RUN npm run build --workspace=@bomberman-area/server

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace=@bomberman-area/server"]