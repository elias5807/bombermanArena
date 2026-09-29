
# Image légère avec Node.js
FROM node:20-alpine
 
WORKDIR /app
 
COPY package.json package-lock.json* ./
RUN npm install
 
# le reste du code source la
COPY . .
 
# Compilation TypeScript -> JavaScript
RUN npm run build
 
EXPOSE 3000
 
CMD ["npm", "start"]