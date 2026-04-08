# syntax=docker/dockerfile:1.7




############################
# base layer
############################
FROM node:22-alpine AS base

ARG SERVICE_NAME

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable pnpm

WORKDIR /app

# copy workspace metadata
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

COPY packages/ ./packages/

# copy only service manifest
COPY services/${SERVICE_NAME}/package.json ./services/${SERVICE_NAME}/


# prefetch deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm fetch



############################
# builder
############################
FROM base AS builder

ARG SERVICE_NAME

WORKDIR /app

COPY packages/common ./packages/common


RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install \
    --filter ${SERVICE_NAME}... \
    --frozen-lockfile \
    --offline


COPY services/${SERVICE_NAME} ./services/${SERVICE_NAME}

WORKDIR /app/services/${SERVICE_NAME}

RUN pnpm run build



############################
# runtime
############################
FROM node:22-alpine AS runtime

ARG SERVICE_NAME

RUN apk add --no-cache tini

WORKDIR /app

USER node

ENV NODE_ENV=production


COPY --chown=node:node \
    --from=builder \
    /app/services/${SERVICE_NAME}/dist \
    ./dist


ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "dist/server.js"]