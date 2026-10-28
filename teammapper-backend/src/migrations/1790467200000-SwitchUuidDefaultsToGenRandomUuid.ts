import { MigrationInterface, QueryRunner } from 'typeorm'

const UUID_COLUMNS = [
  { table: 'mmp_map', column: 'id' },
  { table: 'mmp_map', column: 'adminId' },
  { table: 'mmp_map', column: 'modificationSecret' },
  { table: 'mmp_node', column: 'id' },
]

/**
 * Switches every uuid column default from `uuid_generate_v4()` to
 * `gen_random_uuid()`, which Postgres 13 and later ship built in, so the
 * schema no longer needs the `uuid-ossp` extension. Both functions return
 * random version 4 UUIDs. Leaves an installed `uuid-ossp` in place, because
 * dropping an extension needs rights the database user may lack. Moves no data.
 */
export class SwitchUuidDefaultsToGenRandomUuid1790467200000 implements MigrationInterface {
  name = 'SwitchUuidDefaultsToGenRandomUuid1790467200000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await setUuidDefaults(queryRunner, 'gen_random_uuid()')
  }

  /**
   * Restores `uuid_generate_v4()`, which needs `uuid-ossp` back. Fails where
   * the database user may not create extensions.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
    await setUuidDefaults(queryRunner, 'uuid_generate_v4()')
  }
}

const setUuidDefaults = async (
  queryRunner: QueryRunner,
  generator: string
): Promise<void> => {
  for (const { table, column } of UUID_COLUMNS) {
    await queryRunner.query(
      `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT ${generator}`
    )
  }
}
