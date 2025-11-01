# syntax=docker/dockerfile:1
FROM node:18-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Install minimal OS deps
RUN apk add --no-cache tini

# Install deps first (leverage cache)
COPY package.json package-lock.json ./
# Install production deps
RUN npm ci --omit=dev \
  && npm i -g sequelize-cli

# Copy source
COPY src ./src
COPY config ./config
COPY authApi.md ./authApi.md
COPY .sequelizerc ./.sequelizerc

# Runtime
EXPOSE 4000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "sequelize-cli db:migrate && node src/server.js"]
