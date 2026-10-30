import type { DataMigration } from '../map-format';

/**
 * Every data migration of the offline build, in the order of their format
 * numbers. Add a migration in a file of its own in this folder, named after
 * its format number, such as `0002-<what-it-changes>.ts`, and append it here.
 * See "Change how maps are stored" in `docs/offline.md`.
 */
export const DATA_MIGRATIONS: readonly DataMigration[] = [];
