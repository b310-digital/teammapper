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
    '@mmp/index': '<rootDir>/src/test/mocks/mmp-index.ts',
    '@mmp/map/map': '<rootDir>/src/test/mocks/mmp-map.ts',
  },
  testEnvironment: 'jsdom',
  transformIgnorePatterns: [
    '/node_modules/(?!(.+\\.mjs$|.*uuid.*|zone\\.js.*|d3.*|internmap|delaunator|robust-predicates))',
  ],
  maxWorkers: '50%',
  cacheDirectory: '<rootDir>/.jest-cache',
};
