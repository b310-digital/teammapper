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
    options: {
        fontMaxSize: 1,
        fontMinSize: 1,
        fontIncrement: 1
    },
    nodes: Array<MmpNode>(),
    ...overrides
})

export const createMmpClientMap = (overrides = {}): IMmpClientMap => ({
    uuid: crypto.randomUUID(),
    data: [],
    deleteAfterDays: 30,
    deletedAt: new Date('1970-01-01'),
    lastModified: new Date('1970-01-01'),
    options: {
        fontMaxSize: 1,
        fontMinSize: 1,
        fontIncrement: 1
    },
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