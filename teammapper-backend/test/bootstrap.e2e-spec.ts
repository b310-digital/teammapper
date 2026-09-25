import { INestApplication, INestApplicationContext } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { SchedulerRegistry } from '@nestjs/schedule'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm'
import AppModule from '../src/app.module'
import { JobsModule } from '../src/jobs/jobs.module'
import { YjsGateway } from '../src/map/controllers/yjs-gateway.service'
import { YjsPersistenceService } from '../src/map/services/yjs-persistence.service'
import { ImagesService } from '../src/map/services/images.service'
import { MapsService } from '../src/map/services/maps.service'
import { MmpMap } from '../src/map/entities/mmpMap.entity'
import { Repository } from 'typeorm'
import { createTestConfiguration, destroyWorkerDatabase } from './db'

const workerId = process.env.JEST_WORKER_ID || ''

const testDatabase = async () =>
  TypeOrmModule.forRoot(await createTestConfiguration(workerId))

/** Drops the worker database through the connection the map repository uses. */
const dropTestDatabase = (moduleRef: INestApplicationContext) =>
  destroyWorkerDatabase(
    moduleRef.get<Repository<MmpMap>>(getRepositoryToken(MmpMap)).manager
      .connection,
    workerId
  )

describe('JobsModule (e2e)', () => {
  let context: TestingModule

  beforeAll(async () => {
    context = await Test.createTestingModule({
      imports: [ConfigModule, await testDatabase(), JobsModule],
    }).compile()
    await context.init()
  })

  afterAll(async () => {
    await dropTestDatabase(context)
    await context.close()
  })

  it('resolves the services the jobs call', () => {
    expect(context.get(MapsService)).toBeInstanceOf(MapsService)
    expect(context.get(ImagesService)).toBeInstanceOf(ImagesService)
  })

  it('does not build the WebSocket gateway or the cron schedules', () => {
    expect(() => context.get(YjsGateway, { strict: false })).toThrow()
    expect(() => context.get(SchedulerRegistry, { strict: false })).toThrow()
  })
})

describe('AppModule (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, await testDatabase(), AppModule],
    }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await dropTestDatabase(app)
    await app.close()
  })

  it('starts the gateway with its persistence service', () => {
    expect(app.get(YjsGateway)).toBeInstanceOf(YjsGateway)
    expect(app.get(YjsPersistenceService)).toBeInstanceOf(YjsPersistenceService)
  })

  it('registers the map and image cleanup crons', () => {
    expect(app.get(SchedulerRegistry).getCronJobs().size).toBe(2)
  })
})
