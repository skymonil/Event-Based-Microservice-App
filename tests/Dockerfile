FROM node:18-alpine

WORKDIR /app

# 1. Install dependencies (Layer caching)
COPY package*.json ./
RUN npm ci --only=production

# 2. Copy the Test Framework & Suites
COPY common ./common
COPY user-service ./user-service
#COPY order-service ./order-service
# COPY inventory-service ./inventory-service

# 3. Default Command (Overridden by Argo Analysis args)
CMD ["npm", "test"]