# Build context is the repo root: docker build -f docker/bot-manager.Dockerfile .
FROM node:24-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN pnpm install --frozen-lockfile=false
RUN pnpm -r build

FROM node:24-alpine
ENV NODE_ENV=production
ENV LOG_FORMAT=json
WORKDIR /app

# Homelab-pragmatic: ship the built workspace as-is. Slimming via pnpm deploy
# can come later if image size ever matters.
COPY --from=builder /app ./

CMD ["node", "apps/bot-manager/dist/index.js"]
