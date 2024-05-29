import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common'
import { MapsService } from '../services/maps.service'
import { IMmpClientEditingRequest } from '../types'

@Injectable()
export class EditGuard implements CanActivate {
  constructor(private readonly mapsService: MapsService) {}

  canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToWs().getData<IMmpClientEditingRequest>()
    return this.validateRequest(request.mapId, request.modificationSecret)
  }

  async validateRequest(
    mapId: string,
    givenModificationSecret: string
  ): Promise<boolean> {
    const map = await this.mapsService.findMap(mapId)
    if (!map || !map.modificationSecret) return true

    return givenModificationSecret === map.modificationSecret
  }
}
