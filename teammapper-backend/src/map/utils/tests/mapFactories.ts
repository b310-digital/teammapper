import { MmpMap } from "src/map/entities/mmpMap.entity";
import { MmpNode } from "src/map/entities/mmpNode.entity";
import * as crypto from 'crypto'
import { IMmpClientMap, IMmpClientNodeBasics } from "src/map/types";

export const createMmpMap = (overrides = {}): MmpMap => ({
    id: crypto.randomUUID(),
    adminId: 'admin-id',
    modificationSecret: 'modification-secret',
    name: 'Test Map',
    lastModified: new Date('1970-01-01'),
    lastAccessed: new Date('1970-01-01'),
    options: {
        fontMaxSize: 1,
        fontMinSize: 1,
        fontIncrement: 1
    },
    createdAt: new Date('1970-01-01'),
    nodes: Array<MmpNode>(),
    ...overrides
})

export const createMmpRootNode = (map: MmpMap, overrides = {}): MmpNode => ({
    id: crypto.randomUUID(),
    name: 'Root Node',
    children: Array<MmpNode>(),
    root: true,
    coordinatesX: 1,
    coordinatesY: 1,
    ...overrides,
    colorsName: "",
    colorsBackground: "",
    colorsBranch: "",
    fontSize: 0,
    fontStyle: "",
    fontWeight: "",
    imageSrc: "",
    imageSize: 0,
    linkHref: "",
    locked: false,
    detached: false,
    k: 0,
    nodeParentId: "",
    orderNumber: 0,
    lastModified: new Date(),
    createdAt: new Date(),
    nodeMap: map,
    nodeMapId: map.id,
    nodeParent: new MmpNode
})

export const createMmpClientMap = (overrides = {}): IMmpClientMap => ({
    uuid: crypto.randomUUID(),
    data: [],
    deleteAfterDays: 30,
    deletedAt: new Date('1970-01-01'),
    lastModified: new Date('1970-01-01'),
    lastAccessed: new Date('1970-01-01'),
    options: {
        fontMaxSize: 1,
        fontMinSize: 1,
        fontIncrement: 1
    },
    createdAt: new Date('1970-01-01'),
    ...overrides,
})

export const createClientRootNode = (overrides = {}): IMmpClientNodeBasics => ({
    colors: {
        name: '',
        background: '',
        branch: '',
    },
    font: {
        style: '',
        size: 0,
        weight: ''
    },
    name: 'Root node',
    image: {
        src: '',
        size: 0
    },
    ...overrides
})