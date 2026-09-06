module.exports = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testPathIgnorePatterns: ['node_modules/', 'dist/', 'e2e'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  transform: {
    '^.+\\.(t|j)s$': [
      'jest-preset-angular',
      {
        tsconfig: '<rootDir>/src/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.html$',
      },
    ],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/test/**/*.ts',
    '!src/main.ts',
    '!src/polyfills.ts',
    '!src/environments/**',
    'mmp/src/**/*.ts',
    '!mmp/src/**/*.spec.ts',
    '!mmp/src/typings.d.ts',
  ],
  coverageDirectory: 'coverage',
  modulePaths: ['<rootDir>'],
  moduleNameMapper: {
    '@mmp/index': '<rootDir>/src/test/mocks/mmp-index.ts',
    '@mmp/map/map': '<rootDir>/src/test/mocks/mmp-map.ts',
  },
  testEnvironment: 'jsdom',
  transformIgnorePatterns: [
    // `.pnpm` must be allowed through, otherwise this pattern matches at pnpm's
    // `/node_modules/.pnpm/` segment and the ESM-only d3 packages are never transformed.
    '/node_modules/(?!(\\.pnpm|.+\\.mjs$|.*uuid.*|zone\\.js.*|d3.*|internmap|delaunator|robust-predicates))',
  ],
  maxWorkers: '50%',
  cacheDirectory: '<rootDir>/.jest-cache',
};
