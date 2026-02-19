# ---------- Base ----------
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable pnpm

# Copy root workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml* package.json ./

# Copy ONLY the inventory-service code (prevents rebuilding if other services change)
COPY services/inventory-service ./services/inventory-service

# ---------- Build Stage ----------
FROM base AS builder
# Install ALL dependencies (dev + prod) strictly for inventory-service
RUN pnpm install --filter inventory-service... --frozen-lockfile

# Navigate into the service and build the bundle
WORKDIR /app/services/inventory-service
RUN pnpm run build

# ---------- Production Runtime ----------
FROM node:22-alpine AS prod
RUN apk add --no-cache tini
WORKDIR /app
RUN corepack enable pnpm

# Copy the root configuration files again
COPY pnpm-lock.yaml pnpm-workspace.yaml* package.json ./
# Copy JUST the package.json for inventory-service
COPY services/inventory-service/package.json ./services/inventory-service/

# Install ONLY production dependencies for inventory-service
RUN pnpm install --filter inventory-service... --prod --frozen-lockfile && pnpm store prune

# Copy the bundled server.js from the builder stage
COPY --chown=node:node --from=builder /app/services/inventory-service/dist/server.js ./services/inventory-service/server.js

ENV NODE_ENV=production
USER node

ENTRYPOINT ["/sbin/tini", "--"]
# We MUST run the app from inside its folder so it finds its isolated node_modules
WORKDIR /app/services/inventory-service
CMD ["node", "server.js"]