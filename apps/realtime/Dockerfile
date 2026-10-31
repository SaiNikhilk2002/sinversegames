# Realtime server image. Build from the repository root:
#   docker build -f apps/realtime/Dockerfile -t platform-realtime .
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @platform/db generate \
 && pnpm --filter @platform/realtime build \
 && pnpm --filter @platform/realtime deploy --prod --legacy /out \
 && cp -r apps/realtime/dist /out/dist

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out /app
USER node
EXPOSE 4200
CMD ["node", "dist/index.js"]
