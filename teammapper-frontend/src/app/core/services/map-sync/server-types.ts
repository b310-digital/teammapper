import { MapSnapshot } from '@mmp/map/types';
import { CachedMapOptions } from 'src/app/shared/models/cached-map.model';
import { ClientMap, ClientPrivateMap, ClientMapInfo } from '@teammapper/shared';

interface ServerMap extends Omit<
  ClientMap,
  'data' | 'options' | 'createdAt' | 'lastModified' | 'deletedAt'
> {
  uuid: string;
  lastModified: string;
  deletedAt: string;
  deleteAfterDays: number;
  data: MapSnapshot;
  options: CachedMapOptions;
  createdAt: string;
  writable?: boolean;
}

interface PrivateServerMap extends Omit<
  ClientPrivateMap,
  'map' | 'adminId' | 'modificationSecret'
> {
  map: ServerMap;
  adminId: string;
  modificationSecret: string;
}

interface ServerMapInfo extends Omit<ClientMapInfo, 'ttl'> {
  uuid: string;
  adminId: string | null;
  modificationSecret: string | null;
  ttl: string | null;
  rootName: string | null;
}

const ReversePropertyMapping = {
  name: 'name',
  locked: 'locked',
  coordinates: 'coordinates',
  image: {
    src: 'imageSrc',
    size: 'imageSize',
  },
  link: {
    href: 'linkHref',
  },
  colors: {
    background: 'backgroundColor',
    branch: 'branchColor',
    name: 'nameColor',
  },
  font: {
    weight: 'fontWeight',
    style: 'fontStyle',
    size: 'fontSize',
  },
  hidden: 'hidden',
} as const;

export { ServerMap, ServerMapInfo, PrivateServerMap, ReversePropertyMapping };
