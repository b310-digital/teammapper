ARG NODE_VERSION=24
ARG ALPINE_VERSION=3.21
ARG PNPM_VERSION=10.33.4

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS base

ENV APP_PATH=/home/node/app
WORKDIR $APP_PATH

RUN corepack enable \
 && chown node:node $APP_PATH

USER node

ARG PNPM_VERSION
RUN corepack prepare pnpm@${PNPM_VERSION} --activate


FROM base AS builder

ENV APP_BACKEND_PATH=${APP_PATH}/teammapper-backend
ENV APP_FRONTEND_PATH=${APP_PATH}/teammapper-frontend

COPY --chown=node:node package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --chown=node:node teammapper-backend/package.json $APP_BACKEND_PATH/
COPY --chown=node:node teammapper-frontend/package.json $APP_FRONTEND_PATH/
COPY --chown=node:node teammapper-frontend/packages $APP_FRONTEND_PATH/packages
RUN pnpm install --frozen-lockfile

COPY --chown=node:node teammapper-backend $APP_BACKEND_PATH/
RUN pnpm --filter teammapper-backend run build

COPY --chown=node:node teammapper-frontend $APP_FRONTEND_PATH/
RUN pnpm --filter @teammapper/mermaid-mindmap-parser run build \
 && GENERATE_SOURCEMAP=false pnpm --filter teammapper-frontend run build:prod \
 && mv $APP_FRONTEND_PATH/dist $APP_BACKEND_PATH/client

RUN pnpm --filter teammapper-backend deploy --prod --legacy /home/node/deploy


FROM base AS development


FROM base AS production

USER root
RUN apk add --no-cache tini postgresql-client
USER node

ENV NODE_ENV=production
ENV APP_PROD_PATH=${APP_PATH}/teammapper
WORKDIR $APP_PROD_PATH

COPY --from=builder --chown=node:node /home/node/deploy/ ./
COPY --chown=node:node teammapper-backend/config ./config
COPY --chown=node:node --chmod=755 entrypoint.prod.sh ./

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/home/node/app/teammapper/entrypoint.prod.sh"]
