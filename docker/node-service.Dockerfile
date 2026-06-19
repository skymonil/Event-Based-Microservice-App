# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base

ARG SERVICE_NAME

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apk update && apk upgrade --no-cache

RUN corepack enable pnpm

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

COPY packages ./packages
COPY services ./services

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm fetch


FROM base AS builder

ARG SERVICE_NAME
ENV SERVICE_NAME=${SERVICE_NAME}
WORKDIR /app

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install \
    --filter ${SERVICE_NAME}... \
    --frozen-lockfile \
    --offline

WORKDIR /app/services/${SERVICE_NAME}

RUN pnpm run build


WORKDIR /app

RUN pnpm deploy \
    --filter ${SERVICE_NAME} \
    --prod \
    --legacy \
    /deploy


FROM node:22-alpine AS runtime
ARG SERVICE_NAME
ENV SERVICE_NAME=${SERVICE_NAME}

ENV CI=true

RUN apk update && apk upgrade --no-cache
RUN apk add --no-cache tini
RUN corepack enable pnpm

WORKDIR /app

# 🟢 1. Fix Permissions: Give the node user full ownership of the working directory
RUN chown -R node:node /app

USER node

# 🟢 2. Pre-warm Corepack: Force the download during the build so it doesn't happen in the cluster
RUN pnpm --version

COPY --from=builder /deploy/package.json ./package.json
COPY --from=builder /deploy/node_modules ./node_modules

COPY --from=builder /app/services/${SERVICE_NAME}/dist ./dist

COPY --from=builder /app/services/${SERVICE_NAME}/src/db/migrations ./src/db/migrations

ENTRYPOINT ["/sbin/tini","--"]

CMD ["node","dist/server.js"]