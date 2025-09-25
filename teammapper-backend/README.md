# Backend for TeamMapper

## Description

Backend for TeamMapper, build with [Nest](https://github.com/nestjs/nest)

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
$ pnpm run start

# watch mode
$ pnpm run start:dev

# start backend and frontend at the same time
# frontend is accessible via localhost:4200
$ pnpm run dev

# production mode
$ pnpm run start:prod
```

## Test

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Typeorm
For a list of commands check https://github.com/typeorm/typeorm/blob/master/docs/using-cli.md

Some useful commands include:

Drop schema

```bash
pnpm run dev:typeorm schema:drop
```

For development, sync db structure

```bash
pnpm run dev:typeorm schema:sync
```

For pruction environments, run migrations, see https://github.com/typeorm/typeorm/blob/master/docs/migrations.md

```bash
pnpm run prod:typeorm:migrate
```

or run migrations on dev:

```bash
pnpm run dev:typeorm migration:run
```

Generate new migration based on current changes

```bash
pnpm run dev:typeorm migration:generate -n AddSomethingHere
```

## License

Nest and teammapper are [MIT licensed](LICENSE).
