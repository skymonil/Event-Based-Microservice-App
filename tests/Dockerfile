FROM node:18-alpine

# Enable pnpm using Node's built-in corepack
RUN corepack enable pnpm

WORKDIR /app

# 1. Install dependencies (Layer caching)
# 🟢 Must copy pnpm-lock.yaml instead of package-lock.json
COPY package.json pnpm-lock.yaml ./

# 🟢 The pnpm equivalent of 'npm ci --only=production'
RUN pnpm install --prod --frozen-lockfile

# 2. Copy the Test Framework & Suites
COPY common ./common
COPY tests ./tests

# 3. Default Command (Overridden by Argo Analysis args)
CMD ["pnpm", "run", "test"]