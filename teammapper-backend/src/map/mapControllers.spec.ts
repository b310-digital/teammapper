import { jest } from '@jest/globals'
import { mapControllers } from './mapControllers'
import MermaidController from './controllers/mermaid.controller'
import MapsController from './controllers/maps.controller'
import ImagesController from './controllers/images.controller'

jest.mock('../config.service')

describe('mapControllers', () => {
  it('includes MermaidController when AI is enabled', () => {
    expect(mapControllers(true)).toContain(MermaidController)
  })

  it('excludes MermaidController when AI is disabled', () => {
    expect(mapControllers(false)).not.toContain(MermaidController)
  })

  it.each([true, false])(
    'includes MapsController when aiEnabled is %s',
    (ai) => {
      expect(mapControllers(ai)).toContain(MapsController)
    }
  )

  it.each([true, false])(
    'includes ImagesController when aiEnabled is %s',
    (ai) => {
      expect(mapControllers(ai)).toContain(ImagesController)
    }
  )
})
