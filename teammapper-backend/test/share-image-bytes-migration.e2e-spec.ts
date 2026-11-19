import { readdirSync } from 'fs'
import { join } from 'path'
import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConfigModule } from '@nestjs/config'
import { DataSource } from 'typeorm'
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions'
import AppModule from '../src/app.module'
import { ImagesService } from '../src/map/services/images.service'
import { MapsService } from '../src/map/services/maps.service'
import { createTestConfiguration, destroyWorkerDatabase } from './db'
import { LOGO_PNG } from './imageFixtures'

const NEW_MIGRATION_TIMESTAMP = 1790467200000
const NEW_MIGRATION_NAME = 'ShareImageBytesBetweenMaps1790467200000'
const MIGRATIONS_DIRECTORY = join(__dirname, '..', 'src', 'migrations')
const ENTITY_FILES = join(__dirname, '..', 'src', '**', '*.entity.ts')

/*
 * Rows inserted before the migration runs. Map B is a copy of map A.
 *
 * mmp_image (before and after)
 *   | mapId | id |
 *   |-------|----|
 *   | A     | X  |
 *   | B     | X  |  B's copy of X
 *   | C     | Y  |
 *   | C     | W  |  upload failed before its bytes were stored
 *
 * mmp_image_data before
 *   | mapId | id | data |
 *   |-------|----|------|
 *   | A     | X  | logo |
 *   | B     | X  | logo |  the copy stored the same bytes again
 *   | C     | Y  | logo |
 *   | C     | Z  | logo |  no mmp_image row has id Z
 *
 * mmp_image_data after
 *   | id | data |
 *   |----|------|
 *   | X  | logo |
 *   | Y  | logo |
 */
const MAP_A = '00000000-0000-4000-8000-00000000000a'
const MAP_B = '00000000-0000-4000-8000-00000000000b'
const MAP_C = '00000000-0000-4000-8000-00000000000c'
const IMAGE_X = '00000000-0000-4000-8000-0000000000e1'
const IMAGE_Y = '00000000-0000-4000-8000-0000000000e2'
const IMAGE_Z = '00000000-0000-4000-8000-0000000000e3'
const IMAGE_W = '00000000-0000-4000-8000-0000000000e4'

const workerId = process.env.JEST_WORKER_ID || ''

const allMigrationFiles = (): string[] =>
  readdirSync(MIGRATIONS_DIRECTORY)
    .filter((file) => /^\d+-.*\.ts$/.test(file))
    .sort()
    .map((file) => join(MIGRATIONS_DIRECTORY, file))

const timestampOf = (file: string): number =>
  parseInt(file.split('/').pop()?.split('-')[0] ?? '', 10)

const legacyMigrationFiles = (): string[] =>
  allMigrationFiles().filter(
    (file) => timestampOf(file) < NEW_MIGRATION_TIMESTAMP
  )

const connectionOptions = (
  databaseName: string
): PostgresConnectionOptions => ({
  type: 'postgres',
  host: process.env.POSTGRES_TEST_HOST,
  port: parseInt(process.env.POSTGRES_TEST_PORT || '3000', 10),
  username: process.env.POSTGRES_TEST_USER,
  password: process.env.POSTGRES_TEST_PASSWORD,
  database: databaseName,
  synchronize: false,
})

const migrationDataSource = (
  databaseName: string,
  migrations: string[]
): DataSource =>
  new DataSource({
    ...connectionOptions(databaseName),
    migrationsTableName: 'migration',
    migrations,
  })

const databaseNameOf = (suffix: string): string =>
  `${process.env.POSTGRES_TEST_DATABASE}-${suffix}`

/**
 * Runs every pending migration of the list on the database, then disconnects.
 * The first migration needs the uuid extension, which TypeORM installs for
 * the application only when it loads entities.
 */
const runMigrations = async (
  databaseName: string,
  migrations: string[]
): Promise<void> => {
  const dataSource = migrationDataSource(databaseName, migrations)
  await dataSource.initialize()
  await dataSource.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
  await dataSource.runMigrations()
  await dataSource.destroy()
}

const insertMap = (dataSource: DataSource, mapId: string) =>
  dataSource.query(`INSERT INTO "mmp_map" ("id") VALUES ($1)`, [mapId])

const insertImageReference = (
  dataSource: DataSource,
  mapId: string,
  imageId: string
) =>
  dataSource.query(
    `INSERT INTO "mmp_image" ("mapId", "id", "mimetype", "size")
     VALUES ($1, $2, 'image/png', $3)`,
    [mapId, imageId, LOGO_PNG.length]
  )

const insertLegacyBytes = (
  dataSource: DataSource,
  mapId: string,
  imageId: string
) =>
  dataSource.query(
    `INSERT INTO "mmp_image_data" ("mapId", "id", "data") VALUES ($1, $2, $3)`,
    [mapId, imageId, LOGO_PNG]
  )

/** Inserts the rows that the schema before the migration holds. */
const insertLegacyRows = async (dataSource: DataSource): Promise<void> => {
  for (const mapId of [MAP_A, MAP_B, MAP_C]) await insertMap(dataSource, mapId)
  await insertImageReference(dataSource, MAP_A, IMAGE_X)
  await insertImageReference(dataSource, MAP_B, IMAGE_X)
  await insertImageReference(dataSource, MAP_C, IMAGE_Y)
  await insertImageReference(dataSource, MAP_C, IMAGE_W)
  await insertLegacyBytes(dataSource, MAP_A, IMAGE_X)
  await insertLegacyBytes(dataSource, MAP_B, IMAGE_X)
  await insertLegacyBytes(dataSource, MAP_C, IMAGE_Y)
  await insertLegacyBytes(dataSource, MAP_C, IMAGE_Z)
}

/** Creates the database, migrates it to the legacy schema and fills it. */
const createLegacyDatabase = async (suffix: string): Promise<DataSource> => {
  await createTestConfiguration(suffix)
  const databaseName = databaseNameOf(suffix)
  await runMigrations(databaseName, legacyMigrationFiles())
  const dataSource = migrationDataSource(databaseName, allMigrationFiles())
  await dataSource.initialize()
  await insertLegacyRows(dataSource)
  return dataSource
}

const countBytesRows = async (
  dataSource: DataSource,
  imageId: string
): Promise<number> => {
  const rows: { count: number }[] = await dataSource.query(
    `SELECT count(*)::int AS "count" FROM "mmp_image_data" WHERE "id" = $1`,
    [imageId]
  )
  return rows[0].count
}

const appliedMigrationNames = async (
  dataSource: DataSource
): Promise<string[]> => {
  const rows: { name: string }[] = await dataSource.query(
    `SELECT "name" FROM "migration"`
  )
  return rows.map((row) => row.name)
}

/**
 * Lists the statements TypeORM would run on the image tables to make the
 * migrated schema match the entities of the application.
 */
const pendingImageSchemaChanges = async (
  databaseName: string
): Promise<string[]> => {
  const entitySource = new DataSource({
    ...connectionOptions(databaseName),
    entities: [ENTITY_FILES],
  })
  await entitySource.initialize()
  try {
    const pending = await entitySource.driver.createSchemaBuilder().log()
    return pending.upQueries
      .map((query) => query.query)
      .filter((query) => query.includes('mmp_image'))
  } finally {
    await entitySource.destroy()
  }
}

describe('ShareImageBytesBetweenMaps migration', () => {
  const upSuffix = `migration-${workerId}`
  let migrationSource: DataSource
  let moduleFixture: TestingModule
  let imagesService: ImagesService
  let mapsService: MapsService

  beforeAll(async () => {
    migrationSource = await createLegacyDatabase(upSuffix)
    await migrationSource.runMigrations()
    moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule,
        TypeOrmModule.forRoot({
          ...connectionOptions(databaseNameOf(upSuffix)),
          autoLoadEntities: true,
        }),
        AppModule,
      ],
    }).compile()
    imagesService = moduleFixture.get(ImagesService)
    mapsService = moduleFixture.get(MapsService)
  })

  afterAll(async () => {
    await moduleFixture.close()
    await destroyWorkerDatabase(migrationSource, upSuffix)
  })

  describe('after migrating legacy rows', () => {
    it('applies the migration', async () => {
      expect(await appliedMigrationNames(migrationSource)).toContain(
        NEW_MIGRATION_NAME
      )
    })

    it('keeps one bytes row for an image that two maps share', async () => {
      expect(await countBytesRows(migrationSource, IMAGE_X)).toBe(1)
    })

    it('keeps one bytes row for an image that one map holds', async () => {
      expect(await countBytesRows(migrationSource, IMAGE_Y)).toBe(1)
    })

    it('deletes bytes that no image reference points at', async () => {
      expect(await countBytesRows(migrationSource, IMAGE_Z)).toBe(0)
    })

    it.each([
      ['map A', MAP_A, IMAGE_X],
      ['map B', MAP_B, IMAGE_X],
      ['map C', MAP_C, IMAGE_Y],
    ])(
      'reads the logo bytes of %s through the service',
      async (_, mapId, imageId) => {
        const image = await imagesService.readImage(mapId, imageId)
        expect(image?.data).toEqual(LOGO_PNG)
      }
    )

    it('answers null when a map reads an image that only another map references', async () => {
      expect(await imagesService.readImage(MAP_C, IMAGE_X)).toBeNull()
    })

    it('keeps the reference of an image without bytes and reads null for it', async () => {
      const rows: { count: number }[] = await migrationSource.query(
        `SELECT count(*)::int AS "count" FROM "mmp_image" WHERE "mapId" = $1 AND "id" = $2`,
        [MAP_C, IMAGE_W]
      )
      expect(rows[0].count).toBe(1)
      expect(await imagesService.readImage(MAP_C, IMAGE_W)).toBeNull()
    })

    it('leaves no pending schema change for the image tables', async () => {
      expect(await pendingImageSchemaChanges(databaseNameOf(upSuffix))).toEqual(
        []
      )
    })
  })

  describe('after migrating legacy rows and deleting map A', () => {
    beforeAll(async () => {
      await mapsService.deleteMap(MAP_A)
    })

    it('still reads the shared image through map B', async () => {
      const image = await imagesService.readImage(MAP_B, IMAGE_X)
      expect(image?.data).toEqual(LOGO_PNG)
    })
  })

  describe('after migrating legacy rows and deleting map A and map B', () => {
    beforeAll(async () => {
      await mapsService.deleteMap(MAP_B)
    })

    it('deletes the bytes of the image that no map references', async () => {
      expect(await countBytesRows(migrationSource, IMAGE_X)).toBe(0)
    })

    it('keeps the bytes of the image that map C references', async () => {
      expect(await countBytesRows(migrationSource, IMAGE_Y)).toBe(1)
    })
  })
})

describe('ShareImageBytesBetweenMaps migration down', () => {
  const downSuffix = `migration-down-${workerId}`
  let dataSource: DataSource

  beforeAll(async () => {
    dataSource = await createLegacyDatabase(downSuffix)
    await dataSource.runMigrations()
  })

  afterAll(async () => {
    await destroyWorkerDatabase(dataSource, downSuffix)
  })

  const countReferencesWithoutOwnBytes = async (): Promise<number> => {
    const rows: { count: number }[] = await dataSource.query(
      `SELECT count(*)::int AS "count" FROM "mmp_image" i
       WHERE NOT EXISTS (
         SELECT 1 FROM "mmp_image_data" d
         WHERE d."mapId" = i."mapId" AND d."id" = i."id"
       )`
    )
    return rows[0].count
  }

  const countBytesRowsOf = async (
    mapId: string,
    imageId: string
  ): Promise<number> => {
    const rows: { count: number }[] = await dataSource.query(
      `SELECT count(*)::int AS "count" FROM "mmp_image_data" WHERE "mapId" = $1 AND "id" = $2`,
      [mapId, imageId]
    )
    return rows[0].count
  }

  const countAllBytesRows = async (): Promise<number> => {
    const rows: { count: number }[] = await dataSource.query(
      `SELECT count(*)::int AS "count" FROM "mmp_image_data"`
    )
    return rows[0].count
  }

  describe('after migrating legacy rows and undoing the migration', () => {
    beforeAll(async () => {
      expect(await appliedMigrationNames(dataSource)).toContain(
        NEW_MIGRATION_NAME
      )
      await dataSource.undoLastMigration()
    })

    it('removes the migration from the applied list', async () => {
      expect(await appliedMigrationNames(dataSource)).not.toContain(
        NEW_MIGRATION_NAME
      )
    })

    it('gives every image reference that had bytes its own bytes row', async () => {
      expect(await countReferencesWithoutOwnBytes()).toBe(1)
    })

    it('creates no bytes row for the reference without bytes', async () => {
      expect(await countBytesRowsOf(MAP_C, IMAGE_W)).toBe(0)
    })

    it('holds one bytes row per image reference with bytes and none for the orphan', async () => {
      expect(await countAllBytesRows()).toBe(3)
    })

    it.each([
      ['map A', MAP_A, IMAGE_X],
      ['map B', MAP_B, IMAGE_X],
      ['map C', MAP_C, IMAGE_Y],
    ])('restores the logo bytes of %s', async (_, mapId, imageId) => {
      const rows: { data: Buffer }[] = await dataSource.query(
        `SELECT "data" FROM "mmp_image_data" WHERE "mapId" = $1 AND "id" = $2`,
        [mapId, imageId]
      )
      expect(rows[0].data).toEqual(LOGO_PNG)
    })
  })
})
