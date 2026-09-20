import type { CachedMap } from '@teammapper/shared';

/**
 * A cached map whose options may be missing, which is how a map arrives before
 * the server has filled them in.
 */
export type MapProperties = Omit<CachedMap, 'options'> & {
  options?: CachedMap['options'];
};
