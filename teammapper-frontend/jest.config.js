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
  ],
  coverageDirectory: 'coverage',
  modulePaths: ['<rootDir>'],
  moduleNameMapper: {
    // The mind map library renders with d3 into a real DOM, which no frontend
    // unit test needs, so jest loads this stub in its place. The library's own
    // suite runs in `packages/mmp`.
    '^@teammapper/mmp$': '<rootDir>/src/test/mocks/mmp.ts',
  },
  testEnvironment: 'jsdom',
  transformIgnorePatterns: [
    // `.pnpm` must be allowed through, otherwise this pattern matches at pnpm's
    // `/node_modules/.pnpm/` segment and the ESM-only packages are never transformed.
    '/node_modules/(?!(\\.pnpm|.+\\.mjs$|.*uuid.*|zone\\.js.*))',
  ],
  maxWorkers: '50%',
  cacheDirectory: '<rootDir>/.jest-cache',
};
