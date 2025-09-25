FROM node:22-alpine3.19 as base

RUN apk add --no-cache postgresql-client make g++ python3 py3-pip curl && npm install -g pnpm

# Ensuring that all npm packages and commands are executed with a non-root user
USER node

ENV APP_PATH=/home/node/app
ENV APP_BACKEND_PATH=${APP_PATH}/teammapper-backend
ENV APP_FRONTEND_PATH=${APP_PATH}/teammapper-frontend

RUN mkdir -p $APP_PATH
WORKDIR $APP_PATH

FROM base as production
USER node

COPY --chown=node:node package.json pnpm-workspace.yaml pnpm-lock.yaml $APP_PATH/
COPY --chown=node:node teammapper-backend/package.json $APP_BACKEND_PATH/
COPY --chown=node:node teammapper-frontend/package.json $APP_FRONTEND_PATH/
COPY --chown=node:node teammapper-frontend/packages $APP_FRONTEND_PATH/packages
RUN pnpm install --frozen-lockfile

COPY --chown=node:node teammapper-backend $APP_BACKEND_PATH/
RUN pnpm --filter teammapper-backend run build

COPY --chown=node:node teammapper-frontend $APP_FRONTEND_PATH/
RUN pnpm --filter @teammapper/mermaid-mindmap-parser run build && GENERATE_SOURCEMAP=false pnpm --filter teammapper-frontend run build:prod

RUN mv $APP_FRONTEND_PATH/dist $APP_BACKEND_PATH/client

COPY --chown=node:node entrypoint.prod.sh $APP_PATH/
CMD ["./entrypoint.prod.sh"]

FROM base as development
USER node
