FROM node:8.11.1-alpine

COPY src/package.json src/package-lock.json ./
RUN npm install --production

COPY src/. .
CMD ["node", "index.js"]
