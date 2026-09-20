FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/game-server/package.json apps/game-server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/game-server apps/game-server
RUN npm run build --workspace game-server

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/apps/game-server/package.json apps/game-server/package.json
COPY --from=builder /app/apps/game-server/dist apps/game-server/dist

EXPOSE 8080
CMD ["node", "apps/game-server/dist/index.js"]
