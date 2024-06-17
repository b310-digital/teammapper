import { Test, TestingModule } from '@nestjs/testing';
import MapsController from './maps.controller';
import { MapsService } from '../services/maps.service';
import { NotFoundException } from '@nestjs/common';
import { MmpMap } from '../entities/mmpMap.entity';
import { IMmpClientMap, IMmpClientPrivateMap } from '../types';

describe('MapsController', () => {
  let mapsController: MapsController;
  let mapsService: MapsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MapsController],
      providers: [
        {
          provide: MapsService,
          useValue: {
            findMap: jest.fn(),
            createEmptyMap: jest.fn(),
            findNodes: jest.fn(),
            addNodes: jest.fn(),
            exportMapToClient: jest.fn(),
          },
        },
      ],
    }).compile();

    mapsController = module.get<MapsController>(MapsController);
    mapsService = module.get<MapsService>(MapsService);
  });

  describe('duplicate', () => {
    it('should duplicate a map correctly', async () => {
        const mapId = 'e7f66b65-ffd5-4387-b645-35f8e794c7e7';
        const oldMap: MmpMap = {
            id: '6357cedd-2621-4033-8958-c50061306cb9',
            adminId: 'old-admin-id',
            modificationSecret: 'old-modification-secret',
            name: 'Test Map',
            lastModified: new Date('1970-01-01'),
            options: {
                fontMaxSize: 1,
                fontMinSize: 1,
                fontIncrement: 1
            },
            nodes: []
        };
        const newMap: MmpMap = {
            id: 'e7f66b65-ffd5-4387-b645-35f8e794c7e7',
            adminId: 'new-admin-id',
            modificationSecret: 'new-modification-secret',
            name: 'Test Map',
            lastModified: new Date('1970-01-01'),
            options: {
                fontMaxSize: 1,
                fontMinSize: 1,
                fontIncrement: 1
            },
            nodes: []
        };
        const exportedMap: IMmpClientMap = {
            uuid: 'e7f66b65-ffd5-4387-b645-35f8e794c7e7',
            data: [],
            deleteAfterDays: 30,
            deletedAt: new Date('1970-01-01'),
            lastModified: new Date('1970-01-01'),
            options: {
                fontMaxSize: 1,
                fontMinSize: 1,
                fontIncrement: 1
            },
        };
        const result: IMmpClientPrivateMap = {
            map: exportedMap,
            adminId: 'new-admin-id',
            modificationSecret: 'new-modification-secret'
        };
        const oldNodes: [] = [];

        jest.spyOn(mapsService, 'findMap').mockResolvedValueOnce(oldMap);
        jest.spyOn(mapsService, 'createEmptyMap').mockResolvedValueOnce(newMap);
        jest.spyOn(mapsService, 'findNodes').mockResolvedValueOnce(oldNodes);
        jest.spyOn(mapsService, 'addNodes').mockResolvedValueOnce([]);
        jest.spyOn(mapsService, 'exportMapToClient').mockResolvedValueOnce(exportedMap);

        const response = await mapsController.duplicate(oldMap.id);

        expect(mapsService.findMap).toHaveBeenCalledWith(oldMap.id);
        expect(mapsService.createEmptyMap).toHaveBeenCalled();
        expect(mapsService.findNodes).toHaveBeenCalledWith(oldMap.id);
        expect(mapsService.addNodes).toHaveBeenCalledWith(mapId, oldNodes);
        expect(mapsService.exportMapToClient).toHaveBeenCalledWith(mapId);
        expect(response).toEqual(result);

        expect(newMap.name).toEqual(oldMap.name);
        expect(newMap.lastModified).toEqual(oldMap.lastModified);
        expect(newMap.nodes).toEqual(oldMap.nodes);
    });

    it('should throw NotFoundException if old map is not found', async () => {
        const mapId = 'test-map-id';

        jest.spyOn(mapsService, 'findMap').mockRejectedValueOnce(new Error('MalformedUUIDError'));

        await expect(mapsController.duplicate(mapId)).rejects.toThrow(NotFoundException);
    });
  });
});