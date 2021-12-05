# Backend for Mindmapper

## Description

Backend for mindmapper, build with [Nest](https://github.com/nestjs/nest)

## Installation

-  Install dependencies
```bash
$ npm install
```

- Duplicate and rename `.env.default`

```bash
cp .env.default .env
```

Change variables according to your preference

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# start backend and frontend at the same time
# frontend is accessible via localhost:4200
$ npm run dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Typeorm
For a list of commands check https://github.com/typeorm/typeorm/blob/master/docs/using-cli.md#drop-database-schema

Some useful commands include:

Drop schema

```bash
npm run typeorm schema:drop
```

For development, sync db structure

```bash
npm run typeorm schema:sync
```

For pruction environments, run migrations

```bash
npm run typeorm:prod:migrate
```

## License

Nest and mindmapper are [MIT licensed](LICENSE).
