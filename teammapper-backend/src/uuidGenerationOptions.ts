/**
 * Makes TypeORM write `gen_random_uuid()` into uuid column defaults and stops
 * it from running CREATE EXTENSION on connect. Postgres 13 and later ship
 * `gen_random_uuid()` built in, so the schema needs no extension, and managed
 * Postgres services that restrict extensions work. TypeORM names the option
 * after `pgcrypto`, the extension that provided the function before Postgres 13.
 */
export const UUID_GENERATION_OPTIONS = {
  uuidExtension: 'pgcrypto',
  installExtensions: false,
} as const
