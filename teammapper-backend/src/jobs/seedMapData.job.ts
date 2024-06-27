import { NestFactory } from '@nestjs/core'
import { MapsService } from '../map/services/maps.service'
import AppModule from '../app.module'
import { Logger } from '@nestjs/common'
import { IMmpClientMap, IMmpClientNode } from 'src/map/types'
import * as crypto from 'crypto'

const createNode: any = (
  isRoot: boolean,
  parentId: string,
  x: number,
  y: number
) => {
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
  }
}

const createMap = (nodes: IMmpClientNode[]): IMmpClientMap => {
  return {
    uuid: crypto.randomUUID(),
    lastModified: new Date(),
    lastAccessed: new Date(), // Do we really want to set this here? Without it there's an error
    deleteAfterDays: 30,
    data: nodes,
    deletedAt: new Date(),
    options: { fontMaxSize: 10, fontIncrement: 5, fontMinSize: 10 }
  }
}

async function bootstrap() {
  const application = await NestFactory.createApplicationContext(AppModule)

  const logger = new Logger('TaskRunner')
  const mapsService = application.get(MapsService)

  logger.log('--- Creating map ... ---')

  const rootNode: IMmpClientNode = createNode(true, '', 0, 0)
  const childNode: IMmpClientNode = createNode(false, rootNode.id, 150, 150)
  const secondChildNode: IMmpClientNode = createNode(
    false,
    childNode.id,
    250,
    250
  )
  const thirdChildNode: IMmpClientNode = createNode(
    false,
    childNode.id,
    350,
    350
  )
  const fourthChildNode: IMmpClientNode = createNode(
    false,
    childNode.id,
    450,
    450
  )
  const fifthChildNode: IMmpClientNode = createNode(
    false,
    childNode.id,
    550,
    550
  )
  const mapData: IMmpClientMap = createMap([
    rootNode,
    childNode,
    secondChildNode,
    thirdChildNode,
    fourthChildNode,
    fifthChildNode,
  ])
  await mapsService.updateMap(mapData)

  logger.log(`--- Map created with id ${mapData.uuid} ---`)

  logger.log('--- Finished creating map ---')

  await application.close()
  process.exit(0)
}

bootstrap()
