FROM node:22-alpine

RUN corepack enable pnpm

WORKDIR /app

# 1. Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 2. Copy the Test Suites and Common utilities
COPY . .

# 3. Default Command (Will be overridden by Argo)
CMD ["pnpm", "run", "test:user"]