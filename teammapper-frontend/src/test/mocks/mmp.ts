/**
 * Stand-in for `@teammapper/mmp` in the frontend unit tests. `jest.config.js`
 * maps the package here through `moduleNameMapper`.
 *
 * Only the property table is stubbed. `MmpMap`, `MapData`, `MapDataChange`,
 * `MapNodeRecord` and `OptionParameters` appear in the frontend in type
 * position alone, and the one spec that calls `MmpService.create` mocks the
 * module itself with `jest.mock`. The table mirrors `PropertyMapping` in
 * `packages/mmp/src/map/data/property-mapping.ts`, so `YjsMapData` can index
 * it.
 */
export const NodePropertyMapping = {
  name: ['name'],
  protected: ['protected'],
  coordinates: ['coordinates'],
  imageSrc: ['image', 'src'],
  imageSize: ['image', 'size'],
  linkHref: ['link', 'href'],
  backgroundColor: ['colors', 'background'],
  branchColor: ['colors', 'branch'],
  fontWeight: ['font', 'weight'],
  fontStyle: ['font', 'style'],
  fontSize: ['font', 'size'],
  nameColor: ['colors', 'name'],
} as const;
