import { Type } from '@nestjs/common'
import MapsController from './controllers/maps.controller'
import ImagesController from './controllers/images.controller'
import MermaidController from './controllers/mermaid.controller'

/** Lists the map controllers; the AI controller joins only with AI enabled. */
export function mapControllers(aiEnabled: boolean): Type<unknown>[] {
  const controllers: Type<unknown>[] = [MapsController, ImagesController]
  if (aiEnabled) controllers.push(MermaidController)
  return controllers
}
