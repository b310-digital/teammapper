export default {
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  // Relative imports carry the `.js` extension Node's ESM loader requires;
  // jest has to resolve them back to the `.ts` sources.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // The library and its ESM-only dependencies (d3, uuid) are compiled to
  // CommonJS for jest. `tsconfig.json` targets the browser bundle, so the
  // module settings are overridden here rather than in a second tsconfig.
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: {
          allowJs: true,
          module: 'commonjs',
          moduleResolution: 'node',
          isolatedModules: true,
        },
      },
    ],
  },
  transformIgnorePatterns: [
    // `.pnpm` must be allowed through, otherwise this pattern matches at pnpm's
    // `/node_modules/.pnpm/` segment and the ESM-only packages are never transformed.
    '/node_modules/(?!(\\.pnpm|.+\\.mjs$|uuid|d3.*|internmap|delaunator|robust-predicates))',
  ],
};
