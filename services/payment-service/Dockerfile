FROM node:22-bookworm-slim

# 1. Install curl and the actual dbmate binary for Linux


WORKDIR /app

# 2. Install npm deps
COPY package*.json ./
RUN npm install

# 3. Copy the rest of the code (needed for the migrations folder)
COPY . .

# 4. Use the global dbmate command directly
CMD ["sh", "-c", "npm run migrate && npm run dev"]