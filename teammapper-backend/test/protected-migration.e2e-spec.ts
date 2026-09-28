import { DataSource } from 'typeorm'
import { MmpMap } from '../src/map/entities/mmpMap.entity'
import { MmpNode } from '../src/map/entities/mmpNode.entity'
import { MmpImage } from '../src/map/entities/mmpImage.entity'
import { MmpImageData } from '../src/map/entities/mmpImageData.entity'
import { MapsService } from '../src/map/services/maps.service'
import { ImagesService } from '../src/map/services/images.service'
import { DatabaseImageStore } from '../src/map/services/database-image-store.service'
import { createMigrationTestOptions, destroyWorkerDatabase } from './db'
import {
  LOCKED_RELEASE_MIGRATIONS,
  upgradeToCurrentRelease,
} from './migrations'

const WORKER_ID = process.env.JEST_WORKER_ID || ''

const MAP = '00000000-0000-4000-8000-000000000000'
const COPY = '00000000-0000-4000-8000-0000000000ff'
const ROOT = '11111111-1111-4111-8111-111111111111'
const CHILD = '22222222-2222-4222-8222-222222222222'

/** Stores a map whose nodes carry the old locked flag. */
async function seedLockedRelease(): Promise<void> {
  const oldRelease = new DataSource(
    await createMigrationTestOptions(WORKER_ID, LOCKED_RELEASE_MIGRATIONS)
  )
  await oldRelease.initialize()
  try {
    await oldRelease.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    await oldRelease.runMigrations()
    await oldRelease.query(`INSERT INTO "mmp_map" ("id") VALUES ($1)`, [MAP])
    await oldRelease.query(
      `INSERT INTO "mmp_node" ("id", "nodeMapId", "nodeParentId", "root", "locked", "coordinatesX", "coordinatesY")
       VALUES ($1, $3, NULL, true, false, 0, 0), ($2, $3, $1, false, true, 200, 0)`,
      [ROOT, CHILD, MAP]
    )
  } finally {
    await oldRelease.destroy()
  }
}

async function columnExists(
  dataSource: DataSource,
  column: string
): Promise<boolean> {
  const rows: unknown[] = await dataSource.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'mmp_node' AND column_name = $1`,
    [column]
  )
  return rows.length > 0
}

describe('ReplaceLockedWithProtectedOnNodes (e2e)', () => {
  let dataSource: DataSource | null = null
  let mapsService: MapsService

  const db = (): DataSource => {
    if (!dataSource) throw new Error('The database was not upgraded')
    return dataSource
  }

  beforeAll(async () => {
    await seedLockedRelease()
    dataSource = await upgradeToCurrentRelease(WORKER_ID)
    const imagesService = new ImagesService(
      dataSource.getRepository(MmpImage),
      new DatabaseImageStore(dataSource.getRepository(MmpImageData))
    )
    mapsService = new MapsService(
      dataSource.getRepository(MmpNode),
      dataSource.getRepository(MmpMap),
      imagesService
    )
  })

  afterAll(async () => {
    if (dataSource) await destroyWorkerDatabase(dataSource, WORKER_ID)
  })

  it('replaces the locked column with protected', async () => {
    expect({
      locked: await columnExists(db(), 'locked'),
      protected: await columnExists(db(), 'protected'),
    }).toEqual({ locked: false, protected: true })
  })

  it('starts every existing node unprotected', async () => {
    const map = await mapsService.exportMapToClient(MAP)

    expect((map?.data ?? []).map((node) => node.protected)).toEqual([
      false,
      false,
    ])
  })

  it('keeps a protection in the database and in a duplicate', async () => {
    await db().query(
      `UPDATE "mmp_node" SET "protected" = true WHERE "id" = $1`,
      [CHILD]
    )
    await db().query(`INSERT INTO "mmp_map" ("id") VALUES ($1)`, [COPY])
    await mapsService.addNodes(COPY, await mapsService.findNodes(MAP))

    const copy = await mapsService.findNodes(COPY)

    expect(copy.find((node) => node.id === CHILD)?.protected).toBe(true)
  })

  it('restores the locked column on the down-migration', async () => {
    await db().undoLastMigration()

    expect({
      locked: await columnExists(db(), 'locked'),
      protected: await columnExists(db(), 'protected'),
    }).toEqual({ locked: true, protected: false })
  })
})
