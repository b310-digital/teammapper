import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';
import { MapsService } from '../services/maps.service';
import { IMmpClientEditingRequest } from '../types'

@Injectable()
export class EditGuard implements CanActivate {
  
  constructor(private readonly mapsService: MapsService) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToWs().getData<IMmpClientEditingRequest>()
    return this.validateRequest(request.mapId, request.editingPassword)
  }

  async validateRequest(mapId: string, givenEditingPassword: string): Promise<boolean> {
    const map = await this.mapsService.findMap(mapId)
    return givenEditingPassword == map.editingPassword;
  }
}
