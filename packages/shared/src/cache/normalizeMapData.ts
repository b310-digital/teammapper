import {
  ClientMap,
  MapNode,
  MapNodeColors,
  MapNodeCoordinates,
  MapNodeFont,
  MapNodeImage,
  MapNodeLink,
  MapOptions,
} from '../models';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const sanitizeKey = (key: string): boolean => !FORBIDDEN_KEYS.has(key);

export const normalizeMapNode = (raw: unknown): MapNode => {
  if (typeof raw !== 'object' || raw === null) {
    return {
      id: 'root',
      parent: null,
      isRoot: true,
      name: '',
      coordinates: { x: 0, y: 0 },
      colors: { branch: '' },
      font: { size: 12, style: 'normal', weight: 'normal' },
      image: { src: '', size: 0 },
      link: { href: '' },
      locked: false,
      detached: false,
      k: 0,
      hidden: false,
      hasHiddenChildNodes: false,
    };
  }

  const r = raw as Record<string, unknown>;

  const id =
    typeof r.id === 'string' && r.id.trim().length > 0
      ? r.id
      : 'node-' + Math.random().toString(36).substring(2, 9);
  const parent =
    typeof r.parent === 'string' && r.parent.trim().length > 0
      ? r.parent
      : null;
  const isRoot = Boolean(r.isRoot ?? parent === null);
  const name = typeof r.name === 'string' ? r.name : '';

  // Coordinates
  const rawCoords =
    typeof r.coordinates === 'object' && r.coordinates !== null
      ? (r.coordinates as Record<string, unknown>)
      : {};
  const coordinates: MapNodeCoordinates = {
    x: typeof rawCoords.x === 'number' && !isNaN(rawCoords.x) ? rawCoords.x : 0,
    y: typeof rawCoords.y === 'number' && !isNaN(rawCoords.y) ? rawCoords.y : 0,
  };

  // Colors
  const rawColors =
    typeof r.colors === 'object' && r.colors !== null
      ? (r.colors as Record<string, unknown>)
      : {};
  const colors: MapNodeColors = {
    branch:
      typeof rawColors.branch === 'string' && sanitizeKey('branch')
        ? rawColors.branch
        : '',
  };
  if (typeof rawColors.name === 'string' && sanitizeKey('name'))
    colors.name = rawColors.name;
  if (typeof rawColors.background === 'string' && sanitizeKey('background'))
    colors.background = rawColors.background;
  if (typeof rawColors.link === 'string' && sanitizeKey('link'))
    colors.link = rawColors.link;

  // Font
  const rawFont =
    typeof r.font === 'object' && r.font !== null
      ? (r.font as Record<string, unknown>)
      : {};
  const font: MapNodeFont = {
    size:
      typeof rawFont.size === 'number' && !isNaN(rawFont.size)
        ? rawFont.size
        : 12,
    style: typeof rawFont.style === 'string' ? rawFont.style : 'normal',
    weight: typeof rawFont.weight === 'string' ? rawFont.weight : 'normal',
  };

  // Image
  const rawImage =
    typeof r.image === 'object' && r.image !== null
      ? (r.image as Record<string, unknown>)
      : {};
  const image: MapNodeImage = {
    src: typeof rawImage.src === 'string' ? rawImage.src : '',
    size:
      typeof rawImage.size === 'number' && !isNaN(rawImage.size)
        ? rawImage.size
        : 0,
  };

  // Link
  const rawLink =
    typeof r.link === 'object' && r.link !== null
      ? (r.link as Record<string, unknown>)
      : {};
  const link: MapNodeLink = {
    href: typeof rawLink.href === 'string' ? rawLink.href : '',
  };

  return {
    id,
    parent,
    isRoot,
    name,
    coordinates,
    colors,
    font,
    image,
    link,
    locked: Boolean(r.locked),
    detached: Boolean(r.detached),
    k: typeof r.k === 'number' && !isNaN(r.k) ? r.k : 0,
    hidden: Boolean(r.hidden),
    hasHiddenChildNodes: Boolean(r.hasHiddenChildNodes),
  };
};

export const normalizeMapData = (rawMap: unknown): ClientMap => {
  if (typeof rawMap !== 'object' || rawMap === null) {
    return {
      uuid: '',
      data: [],
      options: {},
    };
  }

  const r = rawMap as Record<string, unknown>;

  const uuid = typeof r.uuid === 'string' ? r.uuid : '';
  const rawNodes = Array.isArray(r.data) ? r.data : [];
  const data: MapNode[] = rawNodes.map(n => normalizeMapNode(n));

  const rawOptions =
    typeof r.options === 'object' && r.options !== null
      ? (r.options as Record<string, unknown>)
      : {};
  const options: MapOptions = {};
  if (
    typeof rawOptions.fontMaxSize === 'number' &&
    !isNaN(rawOptions.fontMaxSize)
  )
    options.fontMaxSize = rawOptions.fontMaxSize;
  if (
    typeof rawOptions.fontMinSize === 'number' &&
    !isNaN(rawOptions.fontMinSize)
  )
    options.fontMinSize = rawOptions.fontMinSize;
  if (
    typeof rawOptions.fontIncrement === 'number' &&
    !isNaN(rawOptions.fontIncrement)
  )
    options.fontIncrement = rawOptions.fontIncrement;

  const result: ClientMap = {
    uuid,
    data,
    options,
  };

  if (r.createdAt !== undefined)
    result.createdAt = r.createdAt as Date | number | string;
  if (r.lastModified !== undefined)
    result.lastModified = r.lastModified as Date | number | string;
  if (r.lastAccessed !== undefined)
    result.lastAccessed = r.lastAccessed as Date | number | string;
  if (typeof r.deleteAfterDays === 'number')
    result.deleteAfterDays = r.deleteAfterDays;
  if (r.deletedAt !== undefined)
    result.deletedAt = r.deletedAt as Date | number | string;
  if (typeof r.writable === 'boolean') result.writable = r.writable;

  return result;
};
