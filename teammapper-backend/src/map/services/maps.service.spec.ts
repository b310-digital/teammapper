import { Test, TestingModule } from '@nestjs/testing';
import { MapsService } from './maps.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MmpMap } from '../entities/mmpMap.entity';
import { MmpNode } from '../entities/mmpNode.entity';
import { Repository } from 'typeorm';
import { ConfigModule } from '@nestjs/config';
import AppModule from '../../app.module';
import { createTestConfiguration } from '../../../test/db';

describe('MapsController', () => {
  let mapsService: MapsService;
  let nodesRepo: Repository<MmpNode>;
  let mapsRepo: Repository<MmpMap>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule,
        TypeOrmModule.forRoot(createTestConfiguration()),
        AppModule,
      ],
    }).compile();

    mapsRepo = moduleFixture.get<Repository<MmpMap>>(
      getRepositoryToken(MmpMap),
    );
    nodesRepo = moduleFixture.get<Repository<MmpNode>>(
      getRepositoryToken(MmpNode),
    );
    mapsService = new MapsService(nodesRepo, mapsRepo);
  });

  describe('deleteOutdatedMaps', () => {
    it('deletes the old map', async () => {

      const map: MmpMap = await mapsRepo.save({
        lastModified: new Date('2019-01-01'),
      });

      await mapsService.deleteOutdatedMaps(30);
      expect(await mapsService.findMap(map.id)).toEqual(undefined);
    });

    it('does not delete the new map', async () => {

      const map: MmpMap = await mapsRepo.save({
        lastModified: new Date(),
      });

      await mapsService.deleteOutdatedMaps(30);
      const foundMap: MmpMap = await mapsService.findMap(map.id);
      expect(foundMap.id).toEqual(map.id);
    });
  });

  describe('getDeletedAt', () => {
    it('calculates the correct date', async () => {
      expect(mapsService.getDeletedAt(new Date('2022-01-01'), 5)).toEqual(new Date('2022-01-06'));
    });
  });
});