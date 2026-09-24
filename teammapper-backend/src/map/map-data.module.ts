import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MmpMap } from './entities/mmpMap.entity'
import { MmpNode } from './entities/mmpNode.entity'
import { MmpImage } from './entities/mmpImage.entity'
import { MmpImageData } from './entities/mmpImageData.entity'
import { MapsService } from './services/maps.service'
import { ImagesService } from './services/images.service'
import { ImageStore } from './services/image-store'
import { DatabaseImageStore } from './services/database-image-store.service'

// Data access for maps, nodes and images, without the HTTP or WebSocket
// layer, so the jobs can load it in an application context. Exports
// TypeOrmModule because YjsPersistenceService injects the map and node
// repositories directly.
@Module({
  imports: [
    TypeOrmModule.forFeature([MmpMap, MmpNode, MmpImage, MmpImageData]),
  ],
  providers: [
    MapsService,
    ImagesService,
    { provide: ImageStore, useClass: DatabaseImageStore },
  ],
  exports: [MapsService, ImagesService, TypeOrmModule],
})
export class MapDataModule {}
