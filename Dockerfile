FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 SYNC_DIR=server/storage
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src ./src
COPY tsconfig*.json ./
EXPOSE 8787
VOLUME ["/app/server/storage"]
CMD ["npx", "tsx", "server/index.ts"]
