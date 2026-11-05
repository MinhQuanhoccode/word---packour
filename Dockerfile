# Base image with pnpm
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy lockfile and package specs
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Build shared and server
FROM base AS build
COPY packages packages
RUN pnpm install
RUN pnpm --filter @project/shared build
RUN pnpm --filter @project/server build

EXPOSE 2567
CMD ["pnpm", "--filter", "@project/server", "start"]