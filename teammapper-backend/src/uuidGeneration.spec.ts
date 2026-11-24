import { jest } from '@jest/globals'
import { QueryRunner } from 'typeorm'
import { uuidGenerator } from './uuidGeneration'

/** Stubs a query runner on a server that reports `version` as server_version_num. */
const stubServer = (version: number) => {
  const query = jest.fn(async (sql: string) =>
    sql.includes('server_version_num') ? [{ version }] : []
  )
  const queryRunner = { query } as unknown as Pick<QueryRunner, 'query'>
  return { query, queryRunner }
}

describe('uuidGenerator', () => {
  it('returns the built-in gen_random_uuid() on Postgres 13', async () => {
    const { query, queryRunner } = stubServer(130000)

    expect(await uuidGenerator(queryRunner)).toBe('gen_random_uuid()')
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('installs uuid-ossp and returns uuid_generate_v4() on Postgres 12', async () => {
    const { query, queryRunner } = stubServer(120022)

    expect(await uuidGenerator(queryRunner)).toBe('uuid_generate_v4()')
    expect(query).toHaveBeenLastCalledWith(
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`
    )
  })
})
