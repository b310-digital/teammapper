/**
 * Stand-in for `@teammapper/mmp` in the frontend unit tests, which keeps d3
 * out of jest. `jest.config.js` maps the package here through
 * `moduleNameMapper`.
 *
 * The stub exports nothing. `MmpInstance`, `MapData`, `MapDataChange`,
 * `MapNodeRecord` and `OptionParameters` appear in the frontend in type
 * position alone, and the one spec that calls `MmpService.create` mocks the
 * module itself with `jest.mock`.
 */
export {};
