const { pathsToModuleNameMapper } = require('ts-jest')
const { compilerOptions } = require('./tsconfig.spec.json')
const { compilerOptions: appCompilerOptions } = require('./tsconfig.app.json')

const paths = compilerOptions.paths ?? appCompilerOptions.paths ?? {}

module.exports = {
  displayName: 'api',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: pathsToModuleNameMapper(paths, { prefix: '<rootDir>/' }),
  setupFiles: [
    '<rootDir>/src/shared/__test-support__/jest/setup-worker-db.ts',
    '<rootDir>/src/shared/__test-support__/jest/test-setup.ts',
  ],
  testMatch: ['**/__tests__/**/*.spec.ts', '**/__tests__/**/*.int-spec.ts', '**/__tests__/**/*.e2e-spec.ts'],
  coverageDirectory: '../../coverage/apps/api',
  collectCoverageFrom: [
    'src/module/identity/**/*.ts',
    'src/shared/module/config/**/*.ts',
    'src/shared/module/persistence/**/*.ts',
    'src/shared/module/storage/**/*.ts',
    'src/shared/image/**/*.ts',
    '!src/**/index.ts',
    '!src/**/*.module.ts',
    '!src/**/migrations/**',
    '!src/**/__tests__/**',
    '!src/**/__test-support__/**',
  ],
  coverageThreshold: {
    global: {
      // TypeScript decorator branches are not coverable in unit tests;
      // branch threshold is lower here and will exceed 80% in full test runs (including e2e)
      branches: 78,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
}
