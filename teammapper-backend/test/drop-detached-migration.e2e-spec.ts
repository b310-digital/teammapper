import * as Y from 'yjs'
import { DataSource } from 'typeorm'
import { findRootNodes, MapNode } from '@teammapper/shared'
import { MmpMap } from '../src/map/entities/mmpMap.entity'
import { MmpNode } from '../src/map/entities/mmpNode.entity'
import { MapsService } from '../src/map/services/maps.service'
import { hydrateYDoc } from '../src/map/utils/yDocConversion'
import { CreateMapsAndNodes1638048135450 } from '../src/migrations/1638048135450-CreateMapsAndNodes'
import { AddDefaultTimestampToMaps1640704269037 } from '../src/migrations/1640704269037-AddDefaultTimestampToMaps'
import { AddAdminIdForMaps1640939564906 } from '../src/migrations/1640939564906-AddAdminIdForMaps'
import { AddNodeMapIdAsPrimaryColumnOnNodes1644079415806 } from '../src/migrations/1644079415806-AddNodeMapIdAsPrimaryColumnOnNodes'
import { AddIndexToForeignKeysOnMmpNode1663839669273 } from '../src/migrations/1663839669273-AddIndexToForeignKeysOnMmpNode'
import { AddIndexForNodesParents1663927754319 } from '../src/migrations/1663927754319-AddIndexForNodesParents'
import { AddOptionsToMap1668360651755 } from '../src/migrations/1668360651755-AddOptionsToMap'
import { AddLinkHrefToNode1678605712865 } from '../src/migrations/1678605712865-AddLinkHrefToNode'
import { AddModificationSecretToMaps1678976170981 } from '../src/migrations/1678976170981-AddModificationSecretToMaps'
import { AddLastModifiedToNodes1679478438937 } from '../src/migrations/1679478438937-AddLastModifiedToNodes'
import { AddDetachedPropertyToNodes1701777634545 } from '../src/migrations/1701777634545-AddDetachedPropertyToNodes'
import { AddLastAccessedFieldToMap1718959806227 } from '../src/migrations/1718959806227-AddLastAccessedFieldToMap'
import { AddCreatedAtToMap1724314314717 } from '../src/migrations/1724314314717-AddCreatedAtToMap'
import { AddCreatedAtToNode1724314435583 } from '../src/migrations/1724314435583-AddCreatedAtToNode'
import { AddDefaultToCreatedAtMmpMap1724325535133 } from '../src/migrations/1724325535133-AddDefaultToCreatedAtMmpMap'
import { AddDefaultToCreatedAtMmpNode1724325567562 } from '../src/migrations/1724325567562-AddDefaultToCreatedAtMmpNode'
import { AddOwnerId1765782220832 } from '../src/migrations/1765782220832-AddOwnerId'
import { AddLlmUsageCounter1778265117672 } from '../src/migrations/1778265117672-AddLlmUsageCounter'
import { DropDetachedPropertyFromNodes1790121600000 } from '../src/migrations/1790121600000-DropDetachedPropertyFromNodes'
import {
  createMigrationTestOptions,
  destroyWorkerDatabase,
  reopenMigrationTestOptions,
} from './db'

/** Every migration of the release that still stored `detached`. */
const OLD_RELEASE_MIGRATIONS = [
  CreateMapsAndNodes1638048135450,
  AddDefaultTimestampToMaps1640704269037,
  AddAdminIdForMaps1640939564906,
  AddNodeMapIdAsPrimaryColumnOnNodes1644079415806,
  AddIndexToForeignKeysOnMmpNode1663839669273,
  AddIndexForNodesParents1663927754319,
  AddOptionsToMap1668360651755,
  AddLinkHrefToNode1678605712865,
  AddModificationSecretToMaps1678976170981,
  AddLastModifiedToNodes1679478438937,
  AddDetachedPropertyToNodes1701777634545,
  AddLastAccessedFieldToMap1718959806227,
  AddCreatedAtToMap1724314314717,
  AddCreatedAtToNode1724314435583,
  AddDefaultToCreatedAtMmpMap1724325535133,
  AddDefaultToCreatedAtMmpNode1724325567562,
  AddOwnerId1765782220832,
  AddLlmUsageCounter1778265117672,
]

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
    await createMigrationTestOptions(WORKER_ID, OLD_RELEASE_MIGRATIONS)
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

/** Opens the database as the new release does and runs its pending migration. */
async function upgrade(): Promise<DataSource> {
  const migrations = [
    ...OLD_RELEASE_MIGRATIONS,
    DropDetachedPropertyFromNodes1790121600000,
  ]
  const newRelease = new DataSource({
    ...reopenMigrationTestOptions(WORKER_ID, migrations),
    entities: [MmpMap, MmpNode],
  })
  await newRelease.initialize()
  await newRelease.runMigrations()
  return newRelease
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

  beforeAll(async () => {
    await seedOldRelease()
    dataSource = await upgrade()
    mapsService = new MapsService(
      dataSource.getRepository(MmpNode),
      dataSource.getRepository(MmpMap)
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
    await db().undoLastMigration()

    const rows: { detached: boolean }[] = await db().query(
      `SELECT "detached" FROM "mmp_node" WHERE "nodeMapId" = $1`,
      [MAP]
    )
    expect(rows.map((row) => row.detached)).toEqual(OLD_ROWS.map(() => false))
  })
})
