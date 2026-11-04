# Realtime server image (used by Railway via railway.json). Build from the repository root:
#   docker build -f apps/realtime/Dockerfile -t sinversegames-realtime .
FROM node:24-slim AS build
ENV CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo
RUN corepack enable
COPY . .
# Install only the realtime server and the workspace packages it depends on
# (skips the web app's Next.js and Cloudflare toolchain), then bundle it into a
# dist/ plus the native production dependency layout (see tsup.config.ts).
RUN pnpm install --frozen-lockfile --filter "@platform/realtime..." \
 && pnpm --filter @platform/db generate \
 && pnpm --filter @platform/realtime build \
 && pnpm --filter @platform/realtime deploy --prod --legacy --ignore-scripts /runtime

# Runtime: Node, bundle, and frozen production dependencies (Sharp/libvips needs
# its platform-specific native addon; it cannot be bundled into JavaScript).
# Start it with
# node directly; railway.json pins the same command so a pnpm start command set
# in the Railway dashboard can't override it.
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/apps/realtime/dist ./dist
COPY --from=build /runtime/node_modules ./node_modules
USER node
EXPOSE 4200
CMD ["node", "--enable-source-maps", "dist/index.js"]
