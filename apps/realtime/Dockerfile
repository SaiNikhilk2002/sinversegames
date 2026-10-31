# Realtime server image (used by Railway via railway.json). Build from the repository root:
#   docker build -f apps/realtime/Dockerfile -t sinversegames-realtime .
FROM node:24-slim AS build
ENV CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo
RUN corepack enable
COPY . .
# Install only the realtime server and the workspace packages it depends on
# (skips the web app's Next.js and Cloudflare toolchain), then bundle it into a
# self-contained dist/ (see apps/realtime/tsup.config.ts).
RUN pnpm install --frozen-lockfile --filter "@platform/realtime..." \
 && pnpm --filter @platform/db generate \
 && pnpm --filter @platform/realtime build

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/apps/realtime/dist ./dist
USER node
EXPOSE 4200
CMD ["node", "--enable-source-maps", "dist/index.js"]
