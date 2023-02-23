FROM node:18.14.2-alpine3.17 as base

RUN apk add --no-cache postgresql-client

# Ensuring that all npm packages and commands are executed with a non-root user
USER node

ENV APP_PATH=/home/node/app
ENV APP_BACKEND_PATH=${APP_PATH}/teammapper-backend
ENV APP_FRONTEND_PATH=${APP_PATH}/teammapper-frontend

RUN mkdir -p $APP_PATH
WORKDIR $APP_PATH

FROM base as production
USER node

COPY --chown=node:node teammapper-backend/package.json teammapper-backend/package-lock.json $APP_BACKEND_PATH/
RUN npm --prefix teammapper-backend ci

COPY --chown=node:node teammapper-frontend/package.json teammapper-frontend/package-lock.json $APP_FRONTEND_PATH/
RUN npm --prefix teammapper-frontend ci

COPY --chown=node:node package.json $APP_PATH/

COPY --chown=node:node teammapper-backend $APP_BACKEND_PATH/
RUN npm run build:backend:prod

COPY --chown=node:node teammapper-frontend $APP_FRONTEND_PATH/
RUN GENERATE_SOURCEMAP=false npm run build:frontend:prod

COPY --chown=node:node entrypoint.prod.sh $APP_PATH/
CMD ["./entrypoint.prod.sh"]

FROM base as development
USER node

COPY --chown=node:node teammapper-frontend/package.json teammapper-frontend/package-lock.json $APP_FRONTEND_PATH/
RUN npm --prefix teammapper-frontend install

COPY --chown=node:node teammapper-backend/package.json teammapper-backend/package-lock.json $APP_BACKEND_PATH/
RUN npm --prefix teammapper-backend install
