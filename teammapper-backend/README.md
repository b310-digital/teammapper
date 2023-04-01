# Backend for TeamMapper

## Description

Backend for TeamMapper, build with [Nest](https://github.com/nestjs/nest)

## Installation

-  Install dependencies
```bash
$ npm install
```

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
For a list of commands check https://github.com/typeorm/typeorm/blob/master/docs/using-cli.md

Some useful commands include:

Drop schema

```bash
npm run dev:typeorm schema:drop
```

For development, sync db structure

```bash
npm run dev:typeorm schema:sync
```

For pruction environments, run migrations, see https://github.com/typeorm/typeorm/blob/master/docs/migrations.md

```bash
npm run prod:typeorm:migrate
```

or run migrations on dev:

```bash
npm run dev:typeorm migration:run
```

Generate new migration based on current changes

```bash
npm run dev:typeorm migration:generate -n AddSomethingHere
```

## License

Nest and teammapper are [MIT licensed](LICENSE).
