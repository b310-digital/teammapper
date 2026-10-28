import { jest } from '@jest/globals'
import { NestExpressApplication } from '@nestjs/platform-express'
import { mountPictogramProxy } from './pictogram-proxy'

/** Builds an app stub whose settings report the given pictograms flag. */
const createApp = (pictograms: boolean) => {
  const use = jest.fn()
  const settingsService = {
    getSettings: () => ({ systemSettings: { featureFlags: { pictograms } } }),
  }
  const app = { get: () => settingsService, use }
  return { app: app as unknown as NestExpressApplication, use }
}

describe('mountPictogramProxy', () => {
  it('mounts both ARASAAC routes when pictograms are enabled', () => {
    const { app, use } = createApp(true)

    mountPictogramProxy(app)

    const routes = use.mock.calls.map(([route]) => route)
    expect(routes).toEqual(['/arasaac/api', '/arasaac/images'])
  })

  it('mounts no route when pictograms are disabled', () => {
    const { app, use } = createApp(false)

    mountPictogramProxy(app)

    expect(use).not.toHaveBeenCalled()
  })
})
