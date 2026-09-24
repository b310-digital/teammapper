import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Request } from 'express'
import { validate as uuidValidate } from 'uuid'
import { MmpMap } from '../entities/mmpMap.entity'
import { MapsService } from '../services/maps.service'
import { checkWriteAccess } from '../utils/yjsProtocol'

/** A request that passed `MapExistsGuard`, carrying the map of `:id`. */
export interface MapRequest extends Request {
  mmpMap?: MmpMap
}

/** Answers 404 unless `:id` is a uuid naming an existing map. */
@Injectable()
export class MapExistsGuard implements CanActivate {
  constructor(private mapsService: MapsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<MapRequest>()
    const mapId = request.params['id']
    if (typeof mapId !== 'string' || !uuidValidate(mapId)) {
      throw new NotFoundException()
    }
    const map = await this.mapsService.findMap(mapId)
    if (!map) throw new NotFoundException()
    request.mmpMap = map
    return true
  }
}

/**
 * Answers 403 unless the `Authorization` header carries the map's
 * modification secret. The header keeps the secret out of access logs. Runs
 * after `MapExistsGuard`.
 */
@Injectable()
export class MapWriteAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<MapRequest>()
    const map = request.mmpMap
    if (!map) throw new NotFoundException()
    const secret = request.headers.authorization ?? null
    if (!checkWriteAccess(map.modificationSecret, secret)) {
      throw new ForbiddenException()
    }
    return true
  }
}
