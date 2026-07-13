# Abrany — single always-on instance (in-process worker + SQLite need a live server).
# Build a self-contained Next standalone server. Mount a persistent volume at /data.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data
# Next standalone output bundles only what the server needs
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
RUN mkdir -p /data
# Note: no Docker VOLUME directive — Railway rejects it; the persistent disk is
# attached via a Railway Volume mounted at /data (DATA_DIR points there).
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
