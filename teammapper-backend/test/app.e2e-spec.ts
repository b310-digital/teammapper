import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { MmpMap } from 'src/map/entities/mmpMap.entity';
import { MmpNode } from 'src/map/entities/mmpNode.entity';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigModule } from '@nestjs/config';
import { io, Socket } from 'socket.io-client';
import { IMmpClientMap } from 'src/map/types';
import { createTestConfiguration } from './db';
import AppModule from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let nodesRepo: Repository<MmpNode>;
  let mapRepo: Repository<MmpMap>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule,
        TypeOrmModule.forRoot(createTestConfiguration()),
        AppModule,
      ],
    }).compile();

    nodesRepo = moduleFixture.get<Repository<MmpNode>>(
      getRepositoryToken(MmpNode),
    );
    mapRepo = moduleFixture.get<Repository<MmpMap>>(getRepositoryToken(MmpMap));
    app = moduleFixture.createNestApplication();
    server = app.getHttpServer();
    await app.init();
    await app.listen(3000);
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/maps/:id(GET)', async () => {
    const map: MmpMap = await mapRepo.save({ name: 'test' });
    await nodesRepo.save({
      nodeMapId: map.id,
      coordinatesX: 3,
      coordinatesY: 1,
    });
    const response: request.Response = await request(server).get(
      `/api/maps/${map.id}`,
    );
    expect(response.body.uuid).toEqual(map.id);
  });

  describe('WebSocketGateway', () => {
    let socket: Socket;

    beforeEach(async () => {
      socket = io('http://localhost:3000');
    });

    afterEach(async () => {
      socket.close();
    });

    it('lets a user join a map session', async (done) => {
      const map = await mapRepo.save({});

      socket.emit('join', { mapId: map.id, color: '#FFFFFF' }, (result: IMmpClientMap) => {
        expect(result).toBeInstanceOf(Object);
        done();
      });
    });

    it('lets a user create a map', async (done) => {
      const map: IMmpClientMap = {
        uuid: '51271bf2-81fa-477a-b0bd-10cecf8d6b65',
        lastModified: new Date(),
        deleteAfterDays: 30,
        deletedAt: null,
        options: null,
        data: [
          {
            name: 'test',
            coordinates: { x: 1.1, y: 2.2 },
            font: { style: '', size: 5, weight: '' },
            colors: { branch: '', background: '', name: '' },
            image: { size: 60, src: '' },
            parent: '',
            k: -15.361675447001142,
            id: '51271bf2-81fa-477a-b0bd-10cecf8d6b65',
            locked: false,
            isRoot: true,
          },
        ],
      };
      socket.emit('createMap', map, async () => {
        const mapInDb = await mapRepo.findOne({
          where: { id: map.uuid },
        });
        expect(mapInDb.id).toEqual('51271bf2-81fa-477a-b0bd-10cecf8d6b65');
        done();
      });
    });

    it('notifies a user about a new node', async (done) => {
      const map = await mapRepo.save({ id: '51271bf2-81fa-477a-b0bd-10cecf8d6b65' });
      await new Promise<void>((resolve) => socket.emit('join', { mapId: map.id, color: '#FFFFFF' }, () => resolve()));
      socket.on('nodeAdded', (result: any) => {
        expect(result.node.name).toEqual('test');
        done();
      });
      socket.emit('addNode', {
        mapId: map.id,
        node: {
          name: 'test',
          coordinates: { x: 1, y: 2 },
          font: {},
          colors: {},
        },
      });
    });

    it('notifies a user about a node update', async (done) => {
      const map = await mapRepo.save({
        id: '51271bf2-81fa-477a-b0bd-10cecf8d6b65',
        nodes: [
          nodesRepo.create({
            id: '51271bf2-81fa-477a-b0bd-10cecf8d6b65',
            coordinatesX: 1,
            coordinatesY: 2,
            nodeMapId: '51271bf2-81fa-477a-b0bd-10cecf8d6b65',
          }),
        ],
      });
      await new Promise<void>((resolve) => socket.emit('join', { mapId: map.id, color: '#FFFFFF' }, () => resolve()));
      socket.on('nodeUpdated', (result: any) => {
        expect(result.property).toEqual('nodeName');
        expect(result.node.id).toEqual('51271bf2-81fa-477a-b0bd-10cecf8d6b65');
        expect(result.node.coordinates.x).toEqual(3);
        done();
      });
      socket.emit('updateNode', {
        mapId: map.id,
        updatedProperty: 'nodeName',
        node: {
          id: '51271bf2-81fa-477a-b0bd-10cecf8d6b65',
          name: 'test',
          coordinates: { x: 3, y: 4 },
          font: {},
          colors: {},
        },
      });
    });
  });
});
