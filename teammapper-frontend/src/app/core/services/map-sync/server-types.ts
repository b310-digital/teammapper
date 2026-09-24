import {
  CachedMapOptions,
  ClientMap,
  ClientMapInfo,
  ClientPrivateMap,
  MapSnapshot,
} from '@teammapper/shared';

interface ServerMap extends Omit<
  ClientMap,
  'data' | 'options' | 'createdAt' | 'lastModified' | 'deletedAt'
> {
  deleteAfterDays: number;
  data: MapSnapshot;
  options: CachedMapOptions;
  createdAt: string;
  lastModified: string;
  deletedAt: string;
}

interface PrivateServerMap extends Omit<ClientPrivateMap, 'map'> {
  map: ServerMap;
  adminId: string;
  modificationSecret: string;
}

interface ServerMapInfo extends Omit<ClientMapInfo, 'ttl'> {
  ttl: string | null;
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
