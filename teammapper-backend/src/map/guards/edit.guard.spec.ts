import { Test } from '@nestjs/testing';
import { EditGuard } from './edit.guard';
import { MapsService } from '../services/maps.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MmpMap } from '../entities/mmpMap.entity';
import { MmpNode } from '../entities/mmpNode.entity';
import { Repository } from 'typeorm';
import { createMock } from '@golevelup/ts-jest';
import { ExecutionContext } from '@nestjs/common';

describe('EditGuard', () => {
  let guard: EditGuard;
  let mapsService: MapsService;

  const map: MmpMap = new MmpMap()
  map.id = '123'
  map.editingPassword = 'abc' 

  beforeAll(async () => {
    mapsService = createMock<MapsService>({
      findMap: (_uuid: string) => new Promise((resolve, _reject) => {resolve(map)})
    });
    await Test.createTestingModule({
      providers: [
        { provide: MapsService, useValue: mapsService },
        { provide: getRepositoryToken(MmpMap), useValue: createMock<Repository<MmpMap>>() },
        { provide: getRepositoryToken(MmpNode), useValue: createMock<Repository<MmpNode>>() }
      ]
    }).compile();
  });

  beforeEach(() => {
    guard = new EditGuard(mapsService);
  });

  describe('canActivate', () => {
    it('should return true when user provides correct credentials', async () => {
      const mockContext = createMock<ExecutionContext>({
        switchToWs: () => ({
          getData: () => ({ editingPassword: 'abc', mapId: '123' }),
        }),
      });
      const canActivate = await guard.canActivate(mockContext);

      expect(canActivate).toBe(true);
    });

    it('should return false when user is not provided correct credentials', async () => {
      const mockContext = createMock<ExecutionContext>({
        switchToWs: () => ({
          getData: () => ({ editingPassword: 'wrong', mapId: '123' }),
        }),
      });
      const canActivate = await guard.canActivate(mockContext);

      expect(canActivate).toBe(false);
    });
  });
})