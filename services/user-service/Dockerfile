# ---------- Base ----------
FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable pnpm

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml* package.json ./
COPY services/user-service/package.json ./services/user-service/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm fetch


# ---------- Builder ----------
FROM base AS builder

WORKDIR /app

RUN pnpm install \
    --filter user-service... \
    --frozen-lockfile \
    --offline

COPY services/user-service ./services/user-service

WORKDIR /app/services/user-service

RUN pnpm run build


# ---------- Production ----------
FROM node:22-alpine AS prod

RUN apk add --no-cache tini

WORKDIR /app

USER node

ENV NODE_ENV=production

COPY --chown=node:node --from=builder \
    /app/services/user-service/dist \
    ./dist

ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "dist/server.js"]