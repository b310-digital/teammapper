import { Type } from '@nestjs/common'
import MapsController from './controllers/maps.controller'
import ImagesController from './controllers/images.controller'
import MermaidController from './controllers/mermaid.controller'

/** Lists the map controllers, with the AI controller only when AI is on. */
export function mapControllers(aiEnabled: boolean): Type<unknown>[] {
  const controllers: Type<unknown>[] = [MapsController, ImagesController]
  if (aiEnabled) controllers.push(MermaidController)
  return controllers
}
