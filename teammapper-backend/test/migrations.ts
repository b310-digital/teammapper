import { DataSource } from 'typeorm'
import { MmpMap } from '../src/map/entities/mmpMap.entity'
import { MmpNode } from '../src/map/entities/mmpNode.entity'
import { MmpImage } from '../src/map/entities/mmpImage.entity'
import { MmpImageData } from '../src/map/entities/mmpImageData.entity'
import { reopenMigrationTestOptions } from './db'
import { CreateMapsAndNodes1638048135450 } from '../src/migrations/1638048135450-CreateMapsAndNodes'
import { AddDefaultTimestampToMaps1640704269037 } from '../src/migrations/1640704269037-AddDefaultTimestampToMaps'
import { AddAdminIdForMaps1640939564906 } from '../src/migrations/1640939564906-AddAdminIdForMaps'
import { AddNodeMapIdAsPrimaryColumnOnNodes1644079415806 } from '../src/migrations/1644079415806-AddNodeMapIdAsPrimaryColumnOnNodes'
import { AddIndexToForeignKeysOnMmpNode1663839669273 } from '../src/migrations/1663839669273-AddIndexToForeignKeysOnMmpNode'
import { AddIndexForNodesParents1663927754319 } from '../src/migrations/1663927754319-AddIndexForNodesParents'
import { AddOptionsToMap1668360651755 } from '../src/migrations/1668360651755-AddOptionsToMap'
import { AddLinkHrefToNode1678605712865 } from '../src/migrations/1678605712865-AddLinkHrefToNode'
import { AddModificationSecretToMaps1678976170981 } from '../src/migrations/1678976170981-AddModificationSecretToMaps'
import { AddLastModifiedToNodes1679478438937 } from '../src/migrations/1679478438937-AddLastModifiedToNodes'
import { AddDetachedPropertyToNodes1701777634545 } from '../src/migrations/1701777634545-AddDetachedPropertyToNodes'
import { AddLastAccessedFieldToMap1718959806227 } from '../src/migrations/1718959806227-AddLastAccessedFieldToMap'
import { AddCreatedAtToMap1724314314717 } from '../src/migrations/1724314314717-AddCreatedAtToMap'
import { AddCreatedAtToNode1724314435583 } from '../src/migrations/1724314435583-AddCreatedAtToNode'
import { AddDefaultToCreatedAtMmpMap1724325535133 } from '../src/migrations/1724325535133-AddDefaultToCreatedAtMmpMap'
import { AddDefaultToCreatedAtMmpNode1724325567562 } from '../src/migrations/1724325567562-AddDefaultToCreatedAtMmpNode'
import { AddOwnerId1765782220832 } from '../src/migrations/1765782220832-AddOwnerId'
import { AddLlmUsageCounter1778265117672 } from '../src/migrations/1778265117672-AddLlmUsageCounter'
import { DropDetachedPropertyFromNodes1790121600000 } from '../src/migrations/1790121600000-DropDetachedPropertyFromNodes'
import { AddImageTables1790208000000 } from '../src/migrations/1790208000000-AddImageTables'
import { ReplaceLockedWithProtectedOnNodes1790294400000 } from '../src/migrations/1790294400000-ReplaceLockedWithProtectedOnNodes'

/** Every migration of the release that still stored `detached`. */
export const DETACHED_RELEASE_MIGRATIONS = [
  CreateMapsAndNodes1638048135450,
  AddDefaultTimestampToMaps1640704269037,
  AddAdminIdForMaps1640939564906,
  AddNodeMapIdAsPrimaryColumnOnNodes1644079415806,
  AddIndexToForeignKeysOnMmpNode1663839669273,
  AddIndexForNodesParents1663927754319,
  AddOptionsToMap1668360651755,
  AddLinkHrefToNode1678605712865,
  AddModificationSecretToMaps1678976170981,
  AddLastModifiedToNodes1679478438937,
  AddDetachedPropertyToNodes1701777634545,
  AddLastAccessedFieldToMap1718959806227,
  AddCreatedAtToMap1724314314717,
  AddCreatedAtToNode1724314435583,
  AddDefaultToCreatedAtMmpMap1724325535133,
  AddDefaultToCreatedAtMmpNode1724325567562,
  AddOwnerId1765782220832,
  AddLlmUsageCounter1778265117672,
]

/** Every migration of the release that still stored `locked`. */
export const LOCKED_RELEASE_MIGRATIONS = [
  ...DETACHED_RELEASE_MIGRATIONS,
  DropDetachedPropertyFromNodes1790121600000,
  AddImageTables1790208000000,
]

/** Every migration of the current release. Append each new migration here. */
export const CURRENT_MIGRATIONS = [
  ...LOCKED_RELEASE_MIGRATIONS,
  ReplaceLockedWithProtectedOnNodes1790294400000,
]

/**
 * Opens the worker database as the current release does and runs the
 * migrations an older release left pending.
 */
export async function upgradeToCurrentRelease(
  workerId: string
): Promise<DataSource> {
  const currentRelease = new DataSource({
    ...reopenMigrationTestOptions(workerId, CURRENT_MIGRATIONS),
    entities: [MmpMap, MmpNode, MmpImage, MmpImageData],
  })
  await currentRelease.initialize()
  await currentRelease.runMigrations()
  return currentRelease
}
