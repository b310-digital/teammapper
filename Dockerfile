FROM node:16.9.1-alpine3.14 as base
# Ensuring that all npm packages and commands are executed with a non-root user
USER node

ENV APP_PATH=/home/node/app
ENV APP_BACKEND_PATH=${APP_PATH}/mindmapper-backend
ENV APP_FRONTEND_PATH=${APP_PATH}/mindmapper-frontend

RUN mkdir -p $APP_PATH
WORKDIR $APP_PATH

FROM base as production_buildstage
USER node

COPY --chown=node:node mindmapper-backend/package.json mindmapper-backend/package-lock.json $APP_BACKEND_PATH/
RUN npm --prefix mindmapper-backend install

COPY --chown=node:node mindmapper-frontend/package.json mindmapper-frontend/package-lock.json $APP_FRONTEND_PATH/
RUN npm --prefix mindmapper-frontend install

COPY --chown=node:node package.json $APP_PATH/

COPY --chown=node:node mindmapper-backend $APP_BACKEND_PATH/
RUN npm run build:backend:prod

COPY --chown=node:node mindmapper-frontend $APP_FRONTEND_PATH/
RUN GENERATE_SOURCEMAP=false npm run build:frontend:prod

FROM base as production
USER node

COPY --chown=node:node package.json $APP_PATH/

COPY --chown=node:node mindmapper-backend/package.json mindmapper-backend/package-lock.json $APP_BACKEND_PATH/
RUN npm --prefix mindmapper-backend install --production

COPY --chown=node:node --from=production_buildstage $APP_BACKEND_PATH/dist $APP_BACKEND_PATH/dist
COPY --chown=node:node --from=production_buildstage $APP_FRONTEND_PATH/dist $APP_BACKEND_PATH/client

COPY --chown=node:node entrypoint.prod.sh $APP_PATH/
CMD ["./entrypoint.prod.sh"]

FROM base as development
USER node

COPY --chown=node:node mindmapper-frontend/package.json mindmapper-frontend/package-lock.json $APP_FRONTEND_PATH/
RUN npm --prefix mindmapper-frontend install

COPY --chown=node:node mindmapper-backend/package.json mindmapper-backend/package-lock.json $APP_BACKEND_PATH/
RUN npm --prefix mindmapper-backend install
