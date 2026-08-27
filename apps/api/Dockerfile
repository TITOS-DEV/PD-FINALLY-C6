# Build context is the MONOREPO ROOT (see docker-compose.yml: `context: .`),
# because pnpm workspaces need the root lockfile + workspace file to resolve
# @riwi/api's dependencies correctly.

# Node 24, not 20: corepack reads the "packageManager" pin in package.json
# (pnpm@11.22.0, matching what this project was built/tested with) and
# downloads exactly that pnpm version. That pnpm release requires Node
# >=22.13 internally — running it on a Node 20 base crashes the build with
# a confusing "node:sqlite" error that has nothing to do with this project's
# own code. Match the Node major to what pnpm itself needs and it goes away.
FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable
# Tells pnpm it's running non-interactively, so it never pauses a build
# waiting for a terminal confirmation it can't get (e.g. before purging/
# reinstalling node_modules if it thinks the lockfile drifted).
ENV CI=true

# ---- deps: install once, cached as long as lockfiles don't change ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile || pnpm install

# ---- build: compile TypeScript to plain JS ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm --filter @riwi/api build

# ---- runtime: only what's needed to run the compiled server ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY apps/api/package.json ./apps/api/package.json

EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
