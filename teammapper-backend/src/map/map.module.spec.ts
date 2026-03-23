import { jest } from '@jest/globals'
import configService from '../config.service'
import MermaidController from './controllers/mermaid.controller'
import MapsController from './controllers/maps.controller'

jest.mock('../config.service')

describe('MapModule controller registration', () => {
  const isAiEnabledMock = configService.isAiEnabled as jest.MockedFunction<
    typeof configService.isAiEnabled
  >

  it('includes MermaidController when AI is enabled', () => {
    isAiEnabledMock.mockReturnValue(true)

    const controllers = configService.isAiEnabled()
      ? [MapsController, MermaidController]
      : [MapsController]

    expect(controllers).toContain(MermaidController)
    expect(controllers).toContain(MapsController)
  })

  it('excludes MermaidController when AI is disabled', () => {
    isAiEnabledMock.mockReturnValue(false)

    const controllers = configService.isAiEnabled()
      ? [MapsController, MermaidController]
      : [MapsController]

    expect(controllers).not.toContain(MermaidController)
    expect(controllers).toContain(MapsController)
  })
})
