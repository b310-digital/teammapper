import { QueryRunner } from 'typeorm'

/** First `server_version_num` whose Postgres ships `gen_random_uuid()` built in. */
const BUILT_IN_UUID_GENERATOR_VERSION = 130000

/**
 * Makes TypeORM write `gen_random_uuid()` into the uuid column defaults of
 * the DDL it generates, and stops it from running CREATE EXTENSION on
 * connect. The migrations install an extension themselves where the server
 * needs one, see `uuidGenerator`. TypeORM names the option after `pgcrypto`,
 * the extension that provided the function before Postgres 13.
 */
export const UUID_GENERATION_OPTIONS = {
  uuidExtension: 'pgcrypto',
  installExtensions: false,
} as const

/**
 * Returns the SQL call that generates uuid column defaults on the connected
 * server: the built-in `gen_random_uuid()` on Postgres 13 and later, so
 * managed services that restrict extensions work. Older servers get
 * `uuid_generate_v4()`, after this installs `uuid-ossp`.
 */
export const uuidGenerator = async (
  queryRunner: Pick<QueryRunner, 'query'>
): Promise<string> => {
  if (await hasBuiltInUuidGenerator(queryRunner)) return 'gen_random_uuid()'
  await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
  return 'uuid_generate_v4()'
}

const hasBuiltInUuidGenerator = async (
  queryRunner: Pick<QueryRunner, 'query'>
): Promise<boolean> => {
  const rows: { version: number }[] = await queryRunner.query(
    `SELECT current_setting('server_version_num')::int AS version`
  )
  return rows[0].version >= BUILT_IN_UUID_GENERATOR_VERSION
}
