import { Test, TestingModule } from '@nestjs/testing'
import { ConfigModule } from '@nestjs/config'
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { LlmUsageCounter } from '../src/map/entities/llmUsageCounter.entity'
import { LlmUsageCounterService } from '../src/map/services/llm-usage-counter.service'
import { createTestConfiguration, destroyWorkerDatabase } from './db'

describe('LlmUsageCounterService (e2e)', () => {
  let moduleRef: TestingModule
  let service: LlmUsageCounterService
  let repo: Repository<LlmUsageCounter>

  const readRow = async (date: string) => {
    const row = await repo.findOneByOrFail({ dateUsage: date })
    return {
      tokensUsed: Number(row.tokensUsed),
      requestsCount: Number(row.requestsCount),
    }
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule,
        TypeOrmModule.forRoot(
          await createTestConfiguration(process.env.JEST_WORKER_ID || '')
        ),
        TypeOrmModule.forFeature([LlmUsageCounter]),
      ],
      providers: [LlmUsageCounterService],
    }).compile()

    service = moduleRef.get(LlmUsageCounterService)
    repo = moduleRef.get<Repository<LlmUsageCounter>>(
      getRepositoryToken(LlmUsageCounter)
    )
  })

  afterAll(async () => {
    await destroyWorkerDatabase(
      repo.manager.connection,
      process.env.JEST_WORKER_ID || ''
    )
    await moduleRef.close()
  })

  it('reserve creates the row on the INSERT path', async () => {
    const totals = await service.reserve('2026-05-09', 200, 1000)
    expect(totals).toEqual({ tokensUsed: 200, requestsCount: 1 })
  })

  it('reserve increments existing rows via ON CONFLICT DO UPDATE', async () => {
    const date = '2026-05-10'
    await service.reserve(date, 200, 1000)
    const second = await service.reserve(date, 300, 1000)
    expect(second).toEqual({ tokensUsed: 500, requestsCount: 2 })
  })

  it('reserve returns null and leaves the row untouched when the cap is exceeded', async () => {
    const date = '2026-05-11'
    await service.reserve(date, 700, 1000)
    const blocked = await service.reserve(date, 400, 1000)
    expect({ blocked, state: await readRow(date) }).toEqual({
      blocked: null,
      state: { tokensUsed: 700, requestsCount: 1 },
    })
  })

  it('adjustTokens shifts the persisted total', async () => {
    const date = '2026-05-12'
    await service.reserve(date, 200, 1000)
    await service.adjustTokens(date, -150)
    expect(await readRow(date)).toEqual({ tokensUsed: 50, requestsCount: 1 })
  })

  it('release rolls a reservation back fully', async () => {
    const date = '2026-05-13'
    await service.reserve(date, 200, 1000)
    await service.reserve(date, 300, 1000)
    await service.release(date, 300)
    expect(await readRow(date)).toEqual({ tokensUsed: 200, requestsCount: 1 })
  })
})
