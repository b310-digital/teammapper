import * as Y from 'yjs'
import { DataSource } from 'typeorm'
import { findRootNodes, MapNode } from '@teammapper/shared'
import { MmpMap } from '../src/map/entities/mmpMap.entity'
import { MmpNode } from '../src/map/entities/mmpNode.entity'
import { MmpImage } from '../src/map/entities/mmpImage.entity'
import { MmpImageData } from '../src/map/entities/mmpImageData.entity'
import { MapsService } from '../src/map/services/maps.service'
import { ImagesService } from '../src/map/services/images.service'
import { DatabaseImageStore } from '../src/map/services/database-image-store.service'
import { hydrateYDoc } from '../src/map/utils/yDocConversion'
import { createMigrationTestOptions, destroyWorkerDatabase } from './db'
import {
  DETACHED_RELEASE_MIGRATIONS,
  upgradeToCurrentRelease,
} from './migrations'

const WORKER_ID = process.env.JEST_WORKER_ID || ''

const MAP = '00000000-0000-4000-8000-000000000000'
const COPY = '00000000-0000-4000-8000-0000000000ff'
const MAIN = '11111111-1111-4111-8111-111111111111'
const CHILD = '22222222-2222-4222-8222-222222222222'
const NOTE = '33333333-3333-4333-8333-333333333333'
const PASTED = '44444444-4444-4444-8444-444444444444'
const LEGACY = '55555555-5555-4555-8555-555555555555'

interface OldRow {
  id: string
  parent: string | null
  root: boolean
  detached: boolean
  x: number
  y: number
}

/**
 * The old data set: a main tree, a detached note holding a pasted child, and a
 * detached node that an old backend stored with a parent.
 */
const OLD_ROWS: OldRow[] = [
  { id: MAIN, parent: null, root: true, detached: false, x: 0, y: 0 },
  { id: CHILD, parent: MAIN, root: false, detached: false, x: -200, y: -120 },
  { id: NOTE, parent: null, root: false, detached: true, x: 900, y: -400 },
  { id: PASTED, parent: NOTE, root: false, detached: false, x: 700, y: -400 },
  { id: LEGACY, parent: MAIN, root: false, detached: true, x: 300, y: 300 },
]

async function insertOldDataSet(dataSource: DataSource): Promise<void> {
  await dataSource.query(`INSERT INTO "mmp_map" ("id") VALUES ($1)`, [MAP])
  for (const row of OLD_ROWS) {
    await dataSource.query(
      `INSERT INTO "mmp_node" ("id", "nodeMapId", "nodeParentId", "name", "root", "detached", "coordinatesX", "coordinatesY")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [row.id, MAP, row.parent, row.id, row.root, row.detached, row.x, row.y]
    )
  }
}

/** Builds the old release's schema from its migrations and stores the data set. */
async function seedOldRelease(): Promise<void> {
  const oldRelease = new DataSource(
    await createMigrationTestOptions(WORKER_ID, DETACHED_RELEASE_MIGRATIONS)
  )
  await oldRelease.initialize()
  try {
    // A deployed database has the extension from its first start; the first
    // migration's uuid_generate_v4() default needs it on an empty one.
    await oldRelease.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    await oldRelease.runMigrations()
    await insertOldDataSet(oldRelease)
  } finally {
    await oldRelease.destroy()
  }
}

async function detachedColumnExists(dataSource: DataSource): Promise<boolean> {
  const rows: unknown[] = await dataSource.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'mmp_node' AND column_name = 'detached'`
  )
  return rows.length > 0
}

/** Parent of each node by id, as the client receives the map. */
function parentsById(nodes: MapNode[]): Record<string, string | null> {
  return Object.fromEntries(nodes.map((node) => [node.id, node.parent]))
}

describe('DropDetachedPropertyFromNodes (e2e)', () => {
  let dataSource: DataSource | null = null
  let mapsService: MapsService

  /** The upgraded database; throws when the setup in beforeAll failed. */
  const db = (): DataSource => {
    if (!dataSource) throw new Error('The database was not upgraded')
    return dataSource
  }

  /** True while the migrations table lists the migration as executed. */
  const isExecuted = async (name: string): Promise<boolean> => {
    const table = db().options.migrationsTableName ?? 'migrations'
    const rows: unknown[] = await db().query(
      `SELECT 1 FROM "${table}" WHERE "name" = $1`,
      [name]
    )
    return rows.length > 0
  }

  beforeAll(async () => {
    await seedOldRelease()
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

  it('drops the detached column', async () => {
    expect(await detachedColumnExists(db())).toBe(false)
  })

  it('keeps every node and nulls the parent of a detached node that had one', async () => {
    const map = await mapsService.exportMapToClient(MAP)

    expect(parentsById(map?.data ?? [])).toEqual({
      [MAIN]: null,
      [CHILD]: MAIN,
      [NOTE]: null,
      [PASTED]: NOTE,
      [LEGACY]: null,
    })
  })

  it('turns every former detached node into a root without the main-root mark', async () => {
    const map = await mapsService.exportMapToClient(MAP)
    const roots = findRootNodes(map?.data ?? [])

    expect(roots.map((node) => [node.id, node.isRoot])).toEqual([
      [MAIN, true],
      [NOTE, false],
      [LEGACY, false],
    ])
  })

  it('keeps the stored coordinates of every node', async () => {
    const map = await mapsService.exportMapToClient(MAP)
    const coordinates = Object.fromEntries(
      (map?.data ?? []).map((node) => [node.id, node.coordinates])
    )

    expect(coordinates).toEqual(
      Object.fromEntries(
        OLD_ROWS.map((row) => [row.id, { x: row.x, y: row.y }])
      )
    )
  })

  it('sends no detached property to the client', async () => {
    const map = await mapsService.exportMapToClient(MAP)

    expect((map?.data ?? []).some((node) => 'detached' in node)).toBe(false)
  })

  it('hydrates a Y.Doc without a detached entry', async () => {
    const doc = new Y.Doc()
    const map = await mapsService.findMap(MAP)
    if (!map) throw new Error('The migrated map is missing')
    hydrateYDoc(doc, await mapsService.findNodes(MAP), map)

    const nodes = doc.getMap('nodes') as Y.Map<Y.Map<unknown>>
    const entries = Array.from(nodes.values())
    expect({
      size: entries.length,
      detached: entries.some((yNode) => yNode.has('detached')),
    }).toEqual({ size: OLD_ROWS.length, detached: false })
    doc.destroy()
  })

  it('duplicates the migrated map with every tree', async () => {
    await db().query(`INSERT INTO "mmp_map" ("id") VALUES ($1)`, [COPY])

    await mapsService.addNodes(COPY, await mapsService.findNodes(MAP))

    const copied = await mapsService.findNodes(COPY)
    expect(copied.map((node) => node.id).sort()).toEqual(
      OLD_ROWS.map((row) => row.id).sort()
    )
  })

  it('re-adds the column with default false on the down-migration', async () => {
    // Later migrations revert first, until this one is no longer executed.
    while (await isExecuted('DropDetachedPropertyFromNodes1790121600000')) {
      await db().undoLastMigration()
    }

    const rows: { detached: boolean }[] = await db().query(
      `SELECT "detached" FROM "mmp_node" WHERE "nodeMapId" = $1`,
      [MAP]
    )
    expect(rows.map((row) => row.detached)).toEqual(OLD_ROWS.map(() => false))
  })
})
