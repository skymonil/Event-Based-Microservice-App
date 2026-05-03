# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base

ARG SERVICE_NAME

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

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
RUN apk add --no-cache tini

WORKDIR /app
USER node

COPY --from=builder /deploy/package.json ./package.json
COPY --from=builder /deploy/node_modules ./node_modules

COPY --from=builder /app/services/${SERVICE_NAME}/dist ./dist

COPY --from=builder /app/services/${SERVICE_NAME}/src/db/migrations ./src/db/migrations

ENTRYPOINT ["/sbin/tini","--"]

CMD ["node","dist/server.js"]