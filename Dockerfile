ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-alpine AS base

ENV APP_PATH=/home/node/app
WORKDIR $APP_PATH

RUN apk add --no-cache tini

# project-specific: system packages (root)
RUN apk add --no-cache postgresql-client

RUN corepack enable

RUN chown -R node:node $APP_PATH

USER node

# project-specific: package manager
RUN corepack prepare pnpm@10 --activate


FROM base AS builder

ENV APP_BACKEND_PATH=${APP_PATH}/teammapper-backend
ENV APP_FRONTEND_PATH=${APP_PATH}/teammapper-frontend

# project-specific: build
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


FROM base AS development


FROM base AS production

ENV NODE_ENV=production
ENV APP_BACKEND_PATH=${APP_PATH}/teammapper-backend

# project-specific: production artifacts
COPY --chown=node:node package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --chown=node:node teammapper-backend/package.json $APP_BACKEND_PATH/
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder --chown=node:node $APP_BACKEND_PATH/dist   $APP_BACKEND_PATH/dist
COPY --from=builder --chown=node:node $APP_BACKEND_PATH/client $APP_BACKEND_PATH/client
COPY --chown=node:node teammapper-backend/config $APP_BACKEND_PATH/config

COPY --chown=node:node --chmod=755 entrypoint.prod.sh ./

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./entrypoint.prod.sh"]
