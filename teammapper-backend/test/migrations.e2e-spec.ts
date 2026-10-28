import { DataSource } from 'typeorm'
import { createMigrationTestDataSource, destroyWorkerDatabase } from './db'

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const UUID_COLUMNS = [
  { table_name: 'mmp_map', column_name: 'adminId' },
  { table_name: 'mmp_map', column_name: 'id' },
  { table_name: 'mmp_map', column_name: 'modificationSecret' },
  { table_name: 'mmp_node', column_name: 'id' },
]

const expectedDefaults = (generator: string) =>
  UUID_COLUMNS.map((column) => ({ ...column, column_default: generator }))

// Expects Postgres 13 or later, which CI runs; uuidGeneration.spec.ts covers older servers.
describe('migrations (e2e)', () => {
  let dataSource: DataSource | undefined

  const db = (): DataSource => {
    if (!dataSource) throw new Error('migration data source not set up')
    return dataSource
  }

  const readUuidDefaults = () =>
    db().query(
      `SELECT table_name, column_name, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND column_default LIKE '%uuid%'
       ORDER BY table_name, column_name`
    )

  beforeAll(async () => {
    dataSource = await createMigrationTestDataSource(
      process.env.JEST_WORKER_ID || ''
    )
    await dataSource.initialize()
    await dataSource.runMigrations()
  })

  afterAll(async () => {
    if (!dataSource?.isInitialized) return
    await destroyWorkerDatabase(dataSource, process.env.JEST_WORKER_ID || '')
  })

  it('builds the schema on an empty database without the uuid-ossp extension', async () => {
    const extensions = await db().query(
      `SELECT extname FROM pg_extension WHERE extname = 'uuid-ossp'`
    )
    expect(extensions).toEqual([])
  })

  it('sets every uuid column default to gen_random_uuid()', async () => {
    expect(await readUuidDefaults()).toEqual(
      expectedDefaults('gen_random_uuid()')
    )
  })

  it('generates distinct uuids for a new map and its root node', async () => {
    const [map] = await db().query(
      `INSERT INTO "mmp_map" DEFAULT VALUES
       RETURNING "id", "adminId", "modificationSecret"`
    )
    const [node] = await db().query(
      `INSERT INTO "mmp_node" ("nodeMapId", "coordinatesX", "coordinatesY")
       VALUES ($1, 0, 0) RETURNING "id"`,
      [map.id]
    )
    const generated = [map.id, map.adminId, map.modificationSecret, node.id]

    generated.forEach((value) => expect(value).toMatch(UUID_V4))
    expect(new Set(generated).size).toBe(generated.length)
  })

  // Runs last: down() installs uuid-ossp, which the first spec asserts absent.
  it('switches defaults left at uuid_generate_v4() by an earlier version', async () => {
    await db().undoLastMigration()
    expect(await readUuidDefaults()).toEqual(
      expectedDefaults('uuid_generate_v4()')
    )

    await db().runMigrations()
    expect(await readUuidDefaults()).toEqual(
      expectedDefaults('gen_random_uuid()')
    )
  })
})
