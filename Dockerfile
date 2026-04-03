FROM node:20-alpine AS base

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY mythr-prism-back/package.json ./mythr-prism-back/package.json

RUN pnpm install --filter mythr-prism-back... --frozen-lockfile

COPY mythr-prism-back ./mythr-prism-back

WORKDIR /app/mythr-prism-back
RUN pnpm run build

EXPOSE 3000

CMD ["node", "dist/server.js"]
