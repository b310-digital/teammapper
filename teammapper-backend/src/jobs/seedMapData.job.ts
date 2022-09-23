import { NestFactory } from '@nestjs/core';
import { MapsService } from '../map/services/maps.service';
import AppModule from '../app.module';
import { Logger } from '@nestjs/common';
import { IMmpClientMap, IMmpClientNode } from 'src/map/types';
import * as crypto from 'crypto';

const createNode: any = (isRoot: boolean, parentId: string, x: number, y: number) => {
  return {
    colors: {
      name: '#000000',
      background: '#FF0000',
      branch: '#000000',
    },
    coordinates: { x: x, y: y },
    font: {
      style: '',
      size: 10,
      weight: 'bold',
    },
    id: crypto.randomUUID(),
    image: {
      src: '',
      size: 0,
    },
    k: 0,
    locked: false,
    name: 'Seed Data',
    parent: parentId,
    isRoot: isRoot,
  };
};

const createMap: any = (nodes: IMmpClientNode[]) => {
  return  {
    uuid: crypto.randomUUID(),
    lastModified: new Date(),
    deleteAfterDays: 30,
    data: nodes,
    deletedAt: undefined,
  };
};

async function bootstrap() {
  const application = await NestFactory.createApplicationContext(
    AppModule,
  );

  const logger = new Logger('TaskRunner');
  const mapsService = application.get(MapsService);

  logger.log('--- Creating maps ... ---');

  for (let i = 0; i < 5000; i++) {
    const rootNode: IMmpClientNode = createNode(true, '', 0, 0);
    const childNode: IMmpClientNode = createNode(false, rootNode.id, 150, 150);
    const secondChildNode: IMmpClientNode = createNode(false, childNode.id, 250, 250);
    const mapData: IMmpClientMap = createMap([rootNode, childNode, secondChildNode]);
    await mapsService.createMap(mapData);
    logger.log(`--- Map created with id ${mapData.uuid} ---`);
  }

  logger.log('--- Finished creating maps ---');

  await application.close();
  process.exit(0);
}

bootstrap();