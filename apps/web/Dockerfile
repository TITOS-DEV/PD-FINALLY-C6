# Build context is the MONOREPO ROOT (see docker-compose.yml: `context: .`),
# same reasoning as apps/api/Dockerfile: pnpm workspaces need the root
# lockfile + workspace file to resolve @riwi/web's dependencies correctly.

FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable
ENV CI=true

# ---- deps ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile || pnpm install

# ---- build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
# The "docker" configuration (angular.json) is a production-optimized build
# that still points at http://localhost:4000 for the API/WebSocket — that's
# correct here because docker-compose publishes both containers' ports
# straight to the host, so from the BROWSER's point of view the api
# container is just "localhost:4000", same as running it without Docker at
# all. See DECISIONS.md for the full explanation of why this differs from
# the plain "production" configuration (which assumes a reverse proxy).
RUN pnpm --filter @riwi/web run build --configuration docker

# ---- runtime: plain static files behind nginx ----
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist/web/browser /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
