/**
 * Stand-in for `@teammapper/mmp` in the frontend unit tests. `jest.config.js`
 * maps the package here through `moduleNameMapper`.
 *
 * Only the property table is stubbed. `MmpMap` appears in the frontend in type
 * position alone, and `MmpService.create` is reached by one spec, which mocks
 * the module itself with `jest.mock`. The table mirrors `PropertyMapping` in
 * `packages/mmp/src/map/handlers/nodes.ts`, so the Yjs bridge can index it.
 */
export const NodePropertyMapping = {
  name: ['name'],
  locked: ['locked'],
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
  hidden: ['hidden'],
} as const;
