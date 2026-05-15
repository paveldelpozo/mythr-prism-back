FROM node:20-alpine AS base

WORKDIR /app

RUN corepack enable

COPY mythr-prism-back/package.json ./package.json
COPY mythr-prism-back/pnpm-lock.yaml ./pnpm-lock.yaml

RUN pnpm install --frozen-lockfile

COPY mythr-prism-back ./

RUN pnpm run build

EXPOSE 3000

CMD ["node", "dist/server.js"]
