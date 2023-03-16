import { CACHE_MANAGER, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { io, Socket } from 'socket.io-client';
import { MmpMap } from '../entities/mmpMap.entity';
import { MapsService } from '../services/maps.service';
import { MapsGateway } from './maps.gateway';
import { MmpNode } from '../entities/mmpNode.entity';
import { createMock } from '@golevelup/ts-jest';
import { IMmpClientNode } from '../types';

describe('WebSocketGateway', () => {
  let app: INestApplication;
  let mapsService: MapsService;
  let socket: Socket;

  const map: MmpMap = new MmpMap()
  map.id = '123'
  map.editingPassword = 'abc' 

  beforeAll(async () => {
    mapsService = createMock<MapsService>({
      findMap: (_uuid: string) => new Promise((resolve, _reject) => {resolve(map)}),
      removeNode: (_clientNode: IMmpClientNode, _mapId: string) => new Promise((resolve, _reject) => {resolve(new MmpNode())})
    });
    const testingModule = await Test.createTestingModule({
      providers: [
        MapsGateway,
        { provide: MapsService, useValue: mapsService },
        { provide: getRepositoryToken(MmpMap), useValue: createMock<Repository<MmpMap>>() },
        { provide: getRepositoryToken(MmpNode), useValue: createMock<Repository<MmpNode>>() },
        {
          provide: CACHE_MANAGER,
          useValue: createMock<Cache>()
        },
      ]
    }).compile();
    app = testingModule.createNestApplication();
    await app.init();
    await app.listen(3000);
  });

  describe('checkEditingPassword', () => {
    it(`returns false if wrong`, async (done) => {    
      socket = io('http://localhost:3000');
  
      socket.emit('checkEditingPassword', {
        mapId: map.id,
        editingPassword: 'wrong'
      }, (result: boolean) => {
        expect(result).toEqual(false)
        done()
      });
    });
  
    it(`returns true if correct`, async (done) => {    
      socket = io('http://localhost:3000');
  
      socket.emit('checkEditingPassword', {
        mapId: map.id,
        editingPassword: map.editingPassword
      }, (result: boolean) => {
        expect(result).toEqual(true)
        done()
      });
    });
  });

  describe('addNode', () => {
    it(`allows request when editing password is set`, async (done) => {    
      socket = io('http://localhost:3000');
  
      socket.emit('addNode', {
        mapId: map.id,
        editingPassword: map.editingPassword,
        node: {}
      }, (result: boolean) => {
        expect(result).toEqual(true)
        done()
      });
    });
  });

  describe('updateNode', () => {
    it(`allows request when editing password is set`, async (done) => {    
      socket = io('http://localhost:3000');
  
      socket.emit('updateNode', {
        mapId: map.id,
        editingPassword: map.editingPassword,
        node: {}
      }, (result: boolean) => {
        expect(result).toEqual(true)
        done()
      });
    });
  });

  describe('removeNode', () => {
    it(`allows request when editing password is set`, async (done) => {    
      socket = io('http://localhost:3000');
  
      socket.emit('removeNode', {
        mapId: map.id,
        editingPassword: map.editingPassword,
        node: {}
      }, (result: MmpNode | undefined) => {
        expect(result).toEqual({})
        done()
      });
    });
  });

  describe('updateMap', () => {
    it(`allows request when editing password is set`, async (done) => {    
      socket = io('http://localhost:3000');
  
      socket.emit('updateMap', {
        mapId: map.id,
        editingPassword: map.editingPassword,
        map: {}
      }, (result: MmpNode | undefined) => {
        expect(result).toEqual(true)
        done()
      });
    });
  });

  describe('updateMapOptions', () => {
    it(`allows request when editing password is set`, async (done) => {    
      socket = io('http://localhost:3000');
  
      socket.emit('updateMapOptions', {
        mapId: map.id,
        editingPassword: map.editingPassword,
        options: {}
      }, (result: MmpNode | undefined) => {
        expect(result).toEqual(true)
        done()
      });
    });
  });

  afterEach(async () => {
    socket.close()
  })

  afterAll(async () => {
    await app.close();
  });
});